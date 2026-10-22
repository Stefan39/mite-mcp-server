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
    /** Start and end date of the group (YYYY-MM-DD). */
    from: string;
    to: string;
    project_id?: number | null;
    project_name?: string | null;
    [key: string]: unknown;
  };
}
