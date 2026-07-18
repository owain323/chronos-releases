import { relations } from "drizzle-orm";
import {
  users,
  projects,
  projectMembers,
  workspaces,
  workspaceMembers,
  kanbanColumns,
  tasks,
  subtasks,
  taskComments,
  fileSnapshots,
  vendors,
  vendorContacts,
  customers,
  customerContacts,
  costEntries,
  revenueEntries,
  expenseEntries,
  accounts,
  journalEntries,
  milestones,
  notifications,
  webhooks,
  botUserContext,
  botAuthCodes,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  projectMembers: many(projectMembers),
  tasks: many(tasks),
  fileSnapshots: many(fileSnapshots),
  botContexts: many(botUserContext),
}));

export const projectsRelations = relations(projects, ({ many }) => ({
  members: many(projectMembers),
  columns: many(kanbanColumns),
  tasks: many(tasks),
  files: many(fileSnapshots),
  vendors: many(vendors),
  customers: many(customers),
  costEntries: many(costEntries),
  revenueEntries: many(revenueEntries),
  expenseEntries: many(expenseEntries),
  accounts: many(accounts),
  journalEntries: many(journalEntries),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  user: one(users, { fields: [projectMembers.userId], references: [users.id] }),
  project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
}));

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  members: many(workspaceMembers),
  projects: many(projects),
}));

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, { fields: [workspaceMembers.workspaceId], references: [workspaces.id] }),
  user: one(users, { fields: [workspaceMembers.userId], references: [users.id] }),
}));

// Update projects to include workspace relation
// (overwrites the earlier projectsRelations if using later one)

export const kanbanColumnsRelations = relations(kanbanColumns, ({ one, many }) => ({
  project: one(projects, { fields: [kanbanColumns.projectId], references: [projects.id] }),
  tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  column: one(kanbanColumns, { fields: [tasks.columnId], references: [kanbanColumns.id] }),
  assignee: one(users, { fields: [tasks.assigneeId], references: [users.id] }),
  subtasks: many(subtasks),
  comments: many(taskComments),
  files: many(fileSnapshots),
}));

export const subtasksRelations = relations(subtasks, ({ one }) => ({
  task: one(tasks, { fields: [subtasks.taskId], references: [tasks.id] }),
}));

export const taskCommentsRelations = relations(taskComments, ({ one }) => ({
  task: one(tasks, { fields: [taskComments.taskId], references: [tasks.id] }),
  author: one(users, { fields: [taskComments.authorId], references: [users.id] }),
}));

export const fileSnapshotsRelations = relations(fileSnapshots, ({ one }) => ({
  project: one(projects, { fields: [fileSnapshots.projectId], references: [projects.id] }),
  task: one(tasks, { fields: [fileSnapshots.taskId], references: [tasks.id] }),
  uploader: one(users, { fields: [fileSnapshots.uploadedBy], references: [users.id] }),
}));

export const vendorsRelations = relations(vendors, ({ one, many }) => ({
  project: one(projects, { fields: [vendors.projectId], references: [projects.id] }),
  contacts: many(vendorContacts),
  costEntries: many(costEntries),
}));

export const vendorContactsRelations = relations(vendorContacts, ({ one }) => ({
  vendor: one(vendors, { fields: [vendorContacts.vendorId], references: [vendors.id] }),
}));

export const customersRelations = relations(customers, ({ one, many }) => ({
  project: one(projects, { fields: [customers.projectId], references: [projects.id] }),
  contacts: many(customerContacts),
  revenueEntries: many(revenueEntries),
}));

export const customerContactsRelations = relations(customerContacts, ({ one }) => ({
  customer: one(customers, { fields: [customerContacts.customerId], references: [customers.id] }),
}));

export const costEntriesRelations = relations(costEntries, ({ one }) => ({
  project: one(projects, { fields: [costEntries.projectId], references: [projects.id] }),
  vendor: one(vendors, { fields: [costEntries.vendorId], references: [vendors.id] }),
}));

export const revenueEntriesRelations = relations(revenueEntries, ({ one }) => ({
  project: one(projects, { fields: [revenueEntries.projectId], references: [projects.id] }),
  customer: one(customers, { fields: [revenueEntries.customerId], references: [customers.id] }),
}));

export const expenseEntriesRelations = relations(expenseEntries, ({ one }) => ({
  project: one(projects, { fields: [expenseEntries.projectId], references: [projects.id] }),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  project: one(projects, { fields: [accounts.projectId], references: [projects.id] }),
  debitEntries: many(journalEntries, { relationName: "debitAccount" }),
  creditEntries: many(journalEntries, { relationName: "creditAccount" }),
}));

export const journalEntriesRelations = relations(journalEntries, ({ one }) => ({
  project: one(projects, { fields: [journalEntries.projectId], references: [projects.id] }),
  debitAccount: one(accounts, { fields: [journalEntries.debitAccountId], references: [accounts.id], relationName: "debitAccount" }),
  creditAccount: one(accounts, { fields: [journalEntries.creditAccountId], references: [accounts.id], relationName: "creditAccount" }),
}));

export const milestonesRelations = relations(milestones, ({ one }) => ({
  project: one(projects, { fields: [milestones.projectId], references: [projects.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  project: one(projects, { fields: [notifications.projectId], references: [projects.id] }),
}));

export const webhooksRelations = relations(webhooks, ({ one }) => ({
  project: one(projects, { fields: [webhooks.projectId], references: [projects.id] }),
}));

export const botUserContextRelations = relations(botUserContext, ({ one }) => ({
  user: one(users, { fields: [botUserContext.userId], references: [users.id] }),
}));
