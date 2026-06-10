import { useSearchParams } from "react-router-dom";
import { useState, useEffect, useCallback, useMemo } from "react";
import type {
  ColumnFiltersState,
  VisibilityState,
  PaginationState,
  SortingState,
  Updater,
} from "@tanstack/react-table";

interface StoredPreferences {
  columnFilters: ColumnFiltersState;
  columnVisibility: VisibilityState;
}

interface UseDataTableStateOptions {
  tableId: string;
  defaultLimit?: number;
  defaultSorting?: SortingState;
  defaultColumnVisibility?: VisibilityState;
  defaultColumnFilters?: ColumnFiltersState;
}

export function useDataTableState(options: UseDataTableStateOptions) {
  const {
    tableId,
    defaultLimit = 10,
    defaultSorting = [],
    defaultColumnVisibility = {},
    defaultColumnFilters = [],
  } = options;

  const [searchParams, setSearchParams] = useSearchParams();
  const storageKey = `datatable-${tableId}`;

  // Load preferences from localStorage (only on initial mount)
  const loadPreferences = useCallback((): Partial<StoredPreferences> => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }, [storageKey]);

  // URL-based pagination
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(
    searchParams.get("limit") || String(defaultLimit),
    10
  );

  const setPage = useCallback(
    (newPage: number) => {
      setSearchParams(
        (prev) => {
          if (newPage === 1) {
            prev.delete("page");
          } else {
            prev.set("page", String(newPage));
          }
          return prev;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const setLimit = useCallback(
    (newLimit: number) => {
      setSearchParams(
        (prev) => {
          if (newLimit === defaultLimit) {
            prev.delete("limit");
          } else {
            prev.set("limit", String(newLimit));
          }
          prev.delete("page"); // Reset to page 1 when limit changes
          return prev;
        },
        { replace: true }
      );
    },
    [setSearchParams, defaultLimit]
  );

  // URL-based sorting (supports multiple columns: sort=col1.asc,col2.desc)
  const sortingState: SortingState = useMemo(() => {
    const sort = searchParams.get("sort");
    if (sort) {
      return sort.split(",").map((part) => {
        const lastDot = part.lastIndexOf(".");
        if (lastDot === -1) return { id: part, desc: false };
        const id = part.slice(0, lastDot);
        const dir = part.slice(lastDot + 1);
        return { id, desc: dir === "desc" };
      });
    }
    return defaultSorting;
  }, [searchParams, defaultSorting]);

  const onSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const newSorting =
        typeof updater === "function" ? updater(sortingState) : updater;

      setSearchParams(
        (prev) => {
          if (newSorting.length > 0) {
            prev.set(
              "sort",
              newSorting
                .map((s) => `${s.id}.${s.desc ? "desc" : "asc"}`)
                .join(",")
            );
          } else {
            prev.delete("sort");
          }
          return prev;
        },
        { replace: true }
      );
    },
    [setSearchParams, sortingState]
  );

  // localStorage-based preferences
  const [columnFilters, setColumnFiltersState] = useState<ColumnFiltersState>(
    () => loadPreferences().columnFilters ?? defaultColumnFilters
  );

  const [columnVisibility, setColumnVisibilityState] =
    useState<VisibilityState>(() => ({
      ...defaultColumnVisibility,
      ...loadPreferences().columnVisibility,
    }));

  // Wrap setters to handle TanStack's Updater type
  const setColumnFilters = useCallback(
    (updater: Updater<ColumnFiltersState>) => {
      setColumnFiltersState((prev) =>
        typeof updater === "function" ? updater(prev) : updater
      );
    },
    []
  );

  const setColumnVisibility = useCallback(
    (updater: Updater<VisibilityState>) => {
      setColumnVisibilityState((prev) =>
        typeof updater === "function" ? updater(prev) : updater
      );
    },
    []
  );

  // Save preferences to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          columnFilters,
          columnVisibility,
        })
      );
    } catch {
      // Ignore storage errors
    }
  }, [storageKey, columnFilters, columnVisibility]);

  // TanStack Table compatible pagination state
  const paginationState: PaginationState = useMemo(
    () => ({
      pageIndex: page - 1,
      pageSize: limit,
    }),
    [page, limit]
  );

  const onPaginationChange = useCallback(
    (updater: Updater<PaginationState>) => {
      if (typeof updater === "function") {
        const newState = updater({ pageIndex: page - 1, pageSize: limit });
        if (newState.pageIndex + 1 !== page) {
          setPage(newState.pageIndex + 1);
        }
        if (newState.pageSize !== limit) {
          setLimit(newState.pageSize);
        }
      }
    },
    [page, limit, setPage, setLimit]
  );

  return {
    // Pagination (URL-based)
    page,
    setPage,
    limit,
    setLimit,

    // Sorting (URL-based)
    sortingState,
    onSortingChange,

    // Preferences (localStorage-based)
    columnFilters,
    setColumnFilters,
    columnVisibility,
    setColumnVisibility,

    // TanStack Table helpers
    paginationState,
    onPaginationChange,
  };
}
