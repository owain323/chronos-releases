import { db, eq } from "./connection";
import {
  vendors,
  vendorContacts,
  customers,
  customerContacts,
} from "../../drizzle/schema";

// ===== Vendors =====
export async function getVendorsByProjectId(projectId: number) {
  return db
    .select()
    .from(vendors)
    .where(eq(vendors.projectId, projectId))
    .all();
}
export async function getVendorById(vendorId: number) {
  const result = db
    .select()
    .from(vendors)
    .where(eq(vendors.id, vendorId))
    .limit(1)
    .all();
  return result.length > 0 ? result[0] : undefined;
}
export async function createVendor(data: {
  projectId: number;
  name: string;
  description?: string;
}) {
  const now = new Date().toISOString();
  return db
    .insert(vendors)
    .values({
      projectId: data.projectId,
      name: data.name,
      description: data.description ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}
export async function updateVendor(
  vendorId: number,
  data: { name: string; description?: string | null }
) {
  return db
    .update(vendors)
    .set({
      name: data.name,
      description: data.description ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(vendors.id, vendorId))
    .run();
}

// ===== Vendor Contacts =====
export async function getContactsByVendorId(vendorId: number) {
  return db
    .select()
    .from(vendorContacts)
    .where(eq(vendorContacts.vendorId, vendorId))
    .all();
}
export async function getVendorContactsByProjectId(projectId: number) {
  return db
    .select({ contact: vendorContacts, vendorName: vendors.name })
    .from(vendorContacts)
    .innerJoin(vendors, eq(vendorContacts.vendorId, vendors.id))
    .where(eq(vendors.projectId, projectId))
    .all();
}
export async function createVendorContact(data: {
  vendorId: number;
  name: string;
  phone?: string;
  landline?: string;
  email?: string;
  role: "purchaser" | "sales" | "manager" | "other";
  notes?: string;
}) {
  const now = new Date().toISOString();
  return db
    .insert(vendorContacts)
    .values({
      vendorId: data.vendorId,
      name: data.name,
      phone: data.phone ?? null,
      landline: data.landline ?? null,
      email: data.email ?? null,
      role: data.role,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}
export async function updateVendorContact(
  id: number,
  data: {
    name: string;
    phone?: string | null;
    landline?: string | null;
    email?: string | null;
    role: string;
    notes?: string | null;
  }
) {
  return db
    .update(vendorContacts)
    .set({
      name: data.name,
      phone: data.phone ?? null,
      landline: data.landline ?? null,
      email: data.email ?? null,
      role: data.role,
      notes: data.notes ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(vendorContacts.id, id))
    .run();
}

// ===== Customers =====
export async function getCustomersByProjectId(projectId: number) {
  return db
    .select()
    .from(customers)
    .where(eq(customers.projectId, projectId))
    .all();
}
export async function getCustomerById(customerId: number) {
  const result = db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1)
    .all();
  return result.length > 0 ? result[0] : undefined;
}
export async function createCustomer(data: {
  projectId: number;
  name: string;
  description?: string;
}) {
  const now = new Date().toISOString();
  return db
    .insert(customers)
    .values({
      projectId: data.projectId,
      name: data.name,
      description: data.description ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}
export async function updateCustomer(
  customerId: number,
  data: { name: string; description?: string | null }
) {
  return db
    .update(customers)
    .set({
      name: data.name,
      description: data.description ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(customers.id, customerId))
    .run();
}

// ===== Customer Contacts =====
export async function getContactsByCustomerId(customerId: number) {
  return db
    .select()
    .from(customerContacts)
    .where(eq(customerContacts.customerId, customerId))
    .all();
}
export async function getCustomerContactsByProjectId(projectId: number) {
  return db
    .select({ contact: customerContacts, customerName: customers.name })
    .from(customerContacts)
    .innerJoin(customers, eq(customerContacts.customerId, customers.id))
    .where(eq(customers.projectId, projectId))
    .all();
}
export async function createCustomerContact(data: {
  customerId: number;
  name: string;
  phone?: string;
  landline?: string;
  email?: string;
  role: "purchaser" | "sales" | "manager" | "other";
  notes?: string;
}) {
  const now = new Date().toISOString();
  return db
    .insert(customerContacts)
    .values({
      customerId: data.customerId,
      name: data.name,
      phone: data.phone ?? null,
      landline: data.landline ?? null,
      email: data.email ?? null,
      role: data.role,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}
export async function updateCustomerContact(
  id: number,
  data: {
    name: string;
    phone?: string | null;
    landline?: string | null;
    email?: string | null;
    role: string;
    notes?: string | null;
  }
) {
  return db
    .update(customerContacts)
    .set({
      name: data.name,
      phone: data.phone ?? null,
      landline: data.landline ?? null,
      email: data.email ?? null,
      role: data.role,
      notes: data.notes ?? null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(customerContacts.id, id))
    .run();
}
export async function deleteVendor(id: number) {
  return db.delete(vendors).where(eq(vendors.id, id)).run();
}
export async function deleteVendorContact(id: number) {
  return db.delete(vendorContacts).where(eq(vendorContacts.id, id)).run();
}
export async function deleteCustomer(id: number) {
  return db.delete(customers).where(eq(customers.id, id)).run();
}
export async function deleteCustomerContact(id: number) {
  return db.delete(customerContacts).where(eq(customerContacts.id, id)).run();
}
