import { createTimeEntry } from './createTimeEntry.js';
import type { ToolDefinition } from './definition.js';
import { deleteTimeEntry } from './deleteTimeEntry.js';
import { getTimeEntry } from './getTimeEntry.js';
import { listTimeEntries } from './listTimeEntries.js';
import { listCustomers, listProjects, listServices, listUsers } from './masterData.js';
import {
  createCustomer,
  createProject,
  createService,
  deleteCustomer,
  deleteProject,
  deleteService,
  updateCustomer,
  updateProject,
  updateService,
} from './masterDataWrite.js';
import { report } from './report.js';
import { reportBillableRatio } from './reportBillableRatio.js';
import { reportBudget } from './reportBudget.js';
import { reportProjectsByMonth } from './reportProjectsByMonth.js';
import { startTracker, stopTracker } from './tracker.js';
import { trackerStatus } from './trackerStatus.js';
import { updateTimeEntry } from './updateTimeEntry.js';
import { whoami } from './whoami.js';

/** Every tool the server knows. Which of them a session gets decides `selectTools`. */
export const allTools: readonly ToolDefinition[] = [
  whoami,
  reportProjectsByMonth,
  report,
  reportBudget,
  reportBillableRatio,
  listTimeEntries,
  getTimeEntry,
  deleteTimeEntry,
  trackerStatus,
  listCustomers,
  listProjects,
  listServices,
  listUsers,
  createTimeEntry,
  updateTimeEntry,
  startTracker,
  stopTracker,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  createProject,
  updateProject,
  deleteProject,
  createService,
  updateService,
  deleteService,
];
