import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/domain";

export type Profile = {
  id: string;
  full_name: string;
  email: string | null;
  branch_id: string | null;
  approved: boolean;
};

type AuthValue = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadUserData(currentUser: User) {
    // make sure a profile row exists for this account
    const { data: existing } = await supabase
      .from("profiles")
      .select("id, full_name, email, branch_id, approved")
      .eq("id", currentUser.id)
      .maybeSingle();

    let row = existing;
    if (!row) {
      const { data: inserted } = await supabase
        .from("profiles")
        .insert({
          id: currentUser.id,
          email: currentUser.email ?? null,
          full_name:
            (currentUser.user_metadata?.["full_name"] as string | undefined) ??
            currentUser.email?.split("@")[0] ??
            "مستخدم",
        })
        .select("id, full_name, email, branch_id, approved")
        .maybeSingle();
      row = inserted ?? null;
    }
    setProfile(row ?? null);

    let { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", currentUser.id);

    if (!roleRows || roleRows.length === 0) {
      // first ever account becomes the system administrator
      const { data: claimed } = await supabase.rpc("claim_first_admin");
      if (claimed) {
        const again = await supabase.from("user_roles").select("role").eq("user_id", currentUser.id);
        roleRows = again.data ?? [];
        const { data: refreshed } = await supabase
          .from("profiles")
          .select("id, full_name, email, branch_id, approved")
          .eq("id", currentUser.id)
          .maybeSingle();
        if (refreshed) setProfile(refreshed);
      }
    }
    setRoles((roleRows ?? []).map((r) => r.role as AppRole));
  }

  async function refresh() {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    if (data.session?.user) {
      await loadUserData(data.session.user);
    } else {
      setProfile(null);
      setRoles([]);
    }
    setLoading(false);
  }

  useEffect(() => {
    let active = true;
    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!active) return;
      setSession(newSession);
      if (event === "SIGNED_OUT") {
        setProfile(null);
        setRoles([]);
        return;
      }
      if (newSession?.user && (event === "SIGNED_IN" || event === "USER_UPDATED")) {
        setTimeout(() => {
          void loadUserData(newSession.user);
        }, 0);
      }
    });
    void refresh();
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: AuthValue = {
    user: session?.user ?? null,
    session,
    profile,
    roles,
    loading,
    refresh,
    signOut: async () => {
      await supabase.auth.signOut();
      setProfile(null);
      setRoles([]);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function useRoleFlags() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin");
  return {
    roles,
    isAdmin,
    isBranchManager: roles.includes("branch_manager") || isAdmin,
    isCostManager: roles.includes("cost_manager") || isAdmin,
    isWarehouse: roles.includes("warehouse_worker") || isAdmin,
    hasAnyRole: roles.length > 0,
  };
}
