import { create } from "zustand";
import { persist } from "zustand/middleware";

interface PermitStats {
  kbRecords: number;
  addRecords: (count: number) => void;
  reset: () => void;
}

export const usePermitStats = create<PermitStats>()(
  persist(
    (set) => ({
      kbRecords: 20, // ~20 seeded on startup
      addRecords: (count) =>
        set((state) => ({ kbRecords: state.kbRecords + count })),
      reset: () => set({ kbRecords: 20 }),
    }),
    { name: "permit-stats" }
  )
);
