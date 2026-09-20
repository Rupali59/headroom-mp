"use client";

/**
 * Role switch — Lane 0, BUILD.md "highest-leverage decision in the plan".
 * DESIGN.md "Roles": operator (write, lands on Act 2), manager (read-only +
 * aggregates, lands on Act 3), owner (lands on Act 2, ledger drawer).
 *
 * Every lane calls `useRole()` in its own file. Without this file the role
 * switch becomes a prop-drilling refactor across three lanes' components.
 */

import { createContext, useContext, useState, type ReactNode } from "react";

export type Role = "operator" | "manager" | "owner";

interface RoleContextValue {
  role: Role;
  setRole: (role: Role) => void;
}

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("operator");
  return (
    <RoleContext.Provider value={{ role, setRole }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within a RoleProvider");
  return ctx;
}
