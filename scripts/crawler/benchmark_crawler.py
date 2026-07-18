# CHRONOS Benchmark Intelligence — 数据爬虫 (v4.4 WO-DATA-1a)
# 支持 akshare 聚合接口（沪深/港股/美股财报）
# 用法: python scripts/crawler/benchmark_crawler.py --targets targets.csv
# 输出: ${BENCHMARK_ARCHIVE_DIR}/raw/ + normalized/

import argparse
import csv
import json
import os
import sys
import time
import random
from datetime import datetime
from urllib.robotparser import RobotFileParser

# ─── 可选依赖（无 akshare 时降级为 manual 模式） ───
try:
    import akshare as ak

    HAS_AKSHARE = True
except ImportError:
    HAS_AKSHARE = False
    print("[crawler] akshare 未安装, 仅支持 manual 模式")

# ─── 配置 ───
ARCHIVE_DIR = os.environ.get("BENCHMARK_ARCHIVE_DIR", "./benchmark_archive")
RATE_LIMIT = float(os.environ.get("CRAWLER_RATE_LIMIT", "2.0"))  # 秒/请求
MAX_RETRIES = 3

# ─── 合规护栏 ───
COMPLIANCE_NOTE = {
    "akshare": "akshare 聚合自新浪财经/东方财富公开接口，仅供内部学习研究使用",
    "manual": "手动录入公开披露数据",
}


def ensure_dirs(entity, period):
    """创建双档案目录结构"""
    raw_dir = os.path.join(ARCHIVE_DIR, "raw", entity, period)
    norm_dir = os.path.join(ARCHIVE_DIR, "normalized")
    os.makedirs(raw_dir, exist_ok=True)
    os.makedirs(norm_dir, exist_ok=True)
    return raw_dir, norm_dir


def check_robots(url):
    """检查目标站 robots.txt"""
    try:
        rp = RobotFileParser()
        rp.set_url(url + "/robots.txt")
        rp.read()
        return rp
    except Exception:
        return None


def fetch_akshare_financial(ticker, market, years):
    """通过 akshare 获取财报数据（聚合新浪/东方财富公开接口）"""
    if not HAS_AKSHARE:
        raise RuntimeError("akshare not installed")

    all_data = {}
    for year in years:
        try:
            # 沪深财报
            if market == "A":
                df = ak.stock_financial_abstract_ths(symbol=ticker, indicator="按年度")
                if df is not None and not df.empty:
                    row = df[df["报告期"].str.contains(str(year))]
                    if not row.empty:
                        all_data[year] = row.iloc[0].to_dict()
            # 港股
            elif market == "H":
                df = ak.stock_hk_financial_indicator_em(symbol=ticker)
                if df is not None and not df.empty:
                    all_data[year] = extract_hk_row(df, year)
            # 美股
            elif market == "US":
                df = ak.stock_us_financial_report_em(symbol=ticker)
                if df is not None and not df.empty:
                    all_data[year] = extract_us_row(df, year)
        except Exception as e:
            print(f"  [warn] {ticker} {market} {year}: {e}")
            all_data[year] = None

        time.sleep(RATE_LIMIT + random.uniform(0, 1))
    return all_data


def extract_hk_row(df, year):
    """从港股财报 DataFrame 提取指定年数据"""
    for _, row in df.iterrows():
        date_str = str(row.get("日期", row.get("截止日期", "")))
        if str(year) in date_str:
            return row.to_dict()
    return None


def extract_us_row(df, year):
    """从美股财报 DataFrame 提取指定年数据"""
    for _, row in df.iterrows():
        if str(year) in str(row.get("date", row.get("fiscalYear", ""))):
            return row.to_dict()
    return None


def normalize(entity_info, period_info, raw_data, source_info, year):
    """转换原始数据为 normalized JSON 格式 (§4.3 blueprint)"""
    metrics = extract_metrics(raw_data, entity_info["market"])

    return {
        "entity": entity_info,
        "period": period_info,
        "standard": "US_GAAP" if entity_info["market"] in ("US", "ADR") else "CAS",
        "source": source_info,
        "metrics": metrics,
    }


def extract_metrics(raw_data, market):
    """从原始数据提取核心财务指标，带 confidence"""
    if not raw_data:
        return []

    metrics = []

    # 关键词映射（akshare 字段 → 标准 metric_key）
    KEY_MAP = {
        "revenue": ["营业总收入", "营业收入", "Revenue", "Total Revenue", "主营业务收入"],
        "net_income": ["净利润", "归属净利润", "Net Income", "归属于母公司所有者的净利润"],
        "gross_margin": ["毛利率", "Gross Margin"],
        "net_margin": ["净利率", "Net Margin"],
        "roe": ["净资产收益率", "ROE", "加权净资产收益率"],
        "total_assets": ["总资产", "Total Assets", "资产总计"],
        "operating_cash_flow": ["经营活动现金流量净额", "Operating Cash Flow"],
    }

    for key, aliases in KEY_MAP.items():
        value = None
        confidence = 0.70  # 默认解析不确定
        for alias in aliases:
            for k, v in raw_data.items():
                if alias.lower() in str(k).lower():
                    try:
                        value = float(v)
                        confidence = 0.90  # akshare 字段匹配 = 较高可信度
                        break
                    except (ValueError, TypeError):
                        pass
            if value is not None:
                break

        if value is not None:
            unit = "CNY" if market in ("A", "H") else "USD_millions"
            metrics.append(
                {
                    "metric_key": key,
                    "value": value,
                    "unit": unit,
                    "confidence": confidence,
                }
            )

    return metrics


def run_crawler(targets_path):
    """主入口：读 targets → 爬取 → 双档案落盘"""
    if not os.path.exists(targets_path):
        print(f"[crawler] targets file not found: {targets_path}")
        return

    with open(targets_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        targets = [row for row in reader if not row.get("entity", "").startswith("#")]

    print(f"[crawler] 目标: {len(targets)} 个实体")

    for t in targets:
        entity = t["entity"]
        name = t["name"]
        ticker = t["ticker"]
        market = t["market"]
        years = [int(y.strip()) for y in t["years"].split(",")]
        source_pref = t.get("source_pref", "akshare")
        gics = t.get("gics_group", "")

        print(f"\n[{entity}] {name} ({ticker}, {market})")

        entity_info = {
            "name": name,
            "ticker": ticker,
            "market": market,
            "gics_group": gics,
            "gics_sub": "",
        }

        for year in years:
            period_label = f"{year} FY"
            print(f"  {period_label}...")

            raw_dir, norm_dir = ensure_dirs(entity, period_label)

            # 爬取
            raw_data = None
            source_url = ""
            if source_pref == "akshare" and HAS_AKSHARE:
                try:
                    data = fetch_akshare_financial(ticker, market, [year])
                    raw_data = data.get(year)
                    source_url = f"akshare://{ticker}/{market}/{year}"
                except Exception as e:
                    print(f"    [error] akshare failed: {e}")
                    raw_data = None

            if raw_data is None:
                print(f"    [info] 无数据，生成空 normalized 占位")
                raw_data = {}

            # 落 raw
            raw_path = os.path.join(raw_dir, f"{source_pref}.json")
            with open(raw_path, "w", encoding="utf-8") as f:
                json.dump(raw_data, f, ensure_ascii=False, indent=2, default=str)

            # 落 normalized
            period_info = {
                "period_type": "FY",
                "fiscal_year": year,
                "label": period_label,
            }
            source_info = {
                "source_url": source_url,
                "license_note": COMPLIANCE_NOTE.get(source_pref, "manual"),
                "standard": entity_info.get("standard", "CAS"),
            }
            normalized = normalize(entity_info, period_info, raw_data, source_info, year)

            norm_path = os.path.join(norm_dir, f"{entity}_{period_label}.json")
            with open(norm_path, "w", encoding="utf-8") as f:
                json.dump(normalized, f, ensure_ascii=False, indent=2, default=str)

            metrics_count = len(normalized.get("metrics", []))
            print(f"    → {metrics_count} 指标, raw={raw_path}, norm={norm_path}")

    print(f"\n[crawler] 完成, 档案目录: {ARCHIVE_DIR}")
    print("[crawler] 合规: 未存储任何原始披露 PDF, 仅聚合指标字段")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="CHRONOS Benchmark Crawler")
    parser.add_argument(
        "--targets", required=True, help="Path to targets.csv"
    )
    args = parser.parse_args()
    run_crawler(args.targets)
