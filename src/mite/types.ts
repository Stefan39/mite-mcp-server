/** Response shapes of the mite API, limited to the fields this server reads. */

export interface MiteAccount {
  account: {
    id: number;
    name: string;
    title: string;
    currency: string;
  };
}

export interface MiteMyself {
  user: {
    id: number;
    name: string;
    role: string;
    language?: string;
  };
}

export interface MiteTimeEntryGroup {
  time_entry_group: {
    minutes: number;
    /** Revenue in cents; `null` when no hourly rate applies. */
    revenue: number | null;
    /** Present when grouped by month, as `YYYYMM` (e.g. "202606"). */
    month?: string;
    /** Parameters that list the entries behind this group, including its date range. */
    time_entries_params?: { from?: string; to?: string; [key: string]: unknown };
    /** Documented by mite, but not sent for month groups. Kept as a fallback. */
    from?: string;
    project_id?: number | null;
    project_name?: string | null;
    [key: string]: unknown;
  };
}

export interface MiteTimeEntry {
  time_entry: {
    id: number;
    date_at: string;
    minutes: number;
    /** Revenue in cents; `null` when no hourly rate applies. */
    revenue: number | null;
    billable: boolean;
    locked: boolean;
    customer_id: number | null;
    customer_name: string | null;
    project_id: number | null;
    project_name: string | null;
    service_id: number | null;
    service_name: string | null;
    user_id: number;
    user_name: string;
    note: string;
  };
}

export interface MiteTracker {
  tracker: {
    /** Absent while no timer runs: mite then sends `{ "tracker": {} }`. */
    tracking_time_entry?: {
      id: number;
      minutes: number;
      since: string;
    };
  };
}
