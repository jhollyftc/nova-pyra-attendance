"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toDateTimeLocal } from "@/lib/buildDay";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Session = {
  session_id: string;
  session_name: string;
  session_type: string;
  actual_start_time: string | null;
  status: string;
};

type SyncStatus = {
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  last_record_count: number | null;
  configured: boolean;
};

type AttendanceRow = {
  attendance_id: string;
  check_in_time: string;
  status: string;
  display_name: string | null;
  first_name: string;
};

const SESSION_TYPES = [
  "Regular Build",
  "Extended Build",
  "Driver Practice",
  "CAD Meeting",
  "Programming Meeting",
  "Outreach Event",
  "Competition",
  "Fundraiser",
];

export default function AdminDashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [startOpen, setStartOpen] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const [checkoutRow, setCheckoutRow] = useState<AttendanceRow | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [checkoutTime, setCheckoutTime] = useState("");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncStatus | null>(null);
  const [pushing, setPushing] = useState(false);
  const [newSession, setNewSession] = useState({
    session_name: "",
    session_type: "Regular Build",
    location: "",
  });

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/admin/dashboard");
    if (!res.ok) return;
    const data = await res.json();
    setSession(data.session);
    setAttendance(data.attendance);
    setLoading(false);
  }, []);

  const fetchSync = useCallback(async () => {
    const res = await fetch("/api/admin/sync");
    if (res.ok) setSync(await res.json());
  }, []);

  const pushNow = async () => {
    setPushing(true);
    const res = await fetch("/api/admin/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => null);
    // The real outcome, not just "done" — a silent failure here means records
    // quietly stop reaching the cloud.
    if (res.ok) toast.success(data?.message ?? "Pushed to cloud.");
    else toast.error(data?.message ?? "Push failed.");
    setPushing(false);
    fetchSync();
  };

  useEffect(() => {
    fetchData();
    fetchSync();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData, fetchSync]);

  const startSession = async () => {
    if (!newSession.session_name.trim()) return;
    const res = await fetch("/api/admin/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_name: newSession.session_name.trim(),
        session_type: newSession.session_type,
        location: newSession.location.trim() || null,
        session_date: new Date().toISOString().split("T")[0],
        start_now: true,
      }),
    });
    if (!res.ok) {
      toast.error("Failed to start session.");
      return;
    }
    toast.success(`Session "${newSession.session_name}" started.`);
    setStartOpen(false);
    setNewSession({ session_name: "", session_type: "Regular Build", location: "" });
    fetchData();
  };

  const endSession = async () => {
    if (!session) return;
    setEndingSession(true);
    const res = await fetch("/api/admin/sessions/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.session_id }),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success(
        data.missedCount > 0
          ? `Session ended. ${data.missedCount} student(s) marked as missing checkout.`
          : "Session ended."
      );
    } else {
      toast.error("Failed to end session.");
    }
    setEndingSession(false);
    fetchData();
  };

  // A record left open usually means the member forgot to tap out, so the
  // time is editable — prefilled with now for the case where they are leaving.
  const openCheckout = (row: AttendanceRow) => {
    setCheckoutRow(row);
    setCheckoutTime(toDateTimeLocal(new Date()));
    setCheckoutError(null);
  };

  const checkoutMinutes = () => {
    if (!checkoutRow || !checkoutTime) return null;
    const out = new Date(checkoutTime);
    if (Number.isNaN(out.getTime())) return null;
    const mins = Math.round(
      (out.getTime() - new Date(checkoutRow.check_in_time).getTime()) / 60000
    );
    return mins;
  };

  const checkOutMember = async () => {
    if (!checkoutRow) return;
    const mins = checkoutMinutes();
    if (mins === null || mins <= 0) {
      setCheckoutError("Check-out must be after check-in.");
      return;
    }
    setCheckingOut(true);
    setCheckoutError(null);
    const res = await fetch("/api/admin/attendance/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attendanceId: checkoutRow.attendance_id,
        checkOutTime: new Date(checkoutTime).toISOString(),
      }),
    });
    const data = await res.json().catch(() => null);
    setCheckingOut(false);

    if (!res.ok) {
      // Keep the dialog open so the time can be corrected in place.
      setCheckoutError(data?.message ?? "Failed to check out.");
      return;
    }

    toast.success(
      data?.adjusted
        ? `${data.name} checked out — time adjusted.`
        : data?.message ?? "Checked out."
    );
    setCheckoutRow(null);
    fetchData();
  };

  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const getStudentName = (row: AttendanceRow) =>
    row.display_name ?? row.first_name ?? "Unknown";

  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Current Session</CardTitle>
          {!session && !loading && (
            <Button size="sm" onClick={() => setStartOpen(true)}>
              Start Session
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : session ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-lg">{session.session_name}</p>
                <p className="text-sm text-muted-foreground">
                  {session.session_type}
                  {session.actual_start_time &&
                    ` · Started ${formatTime(session.actual_start_time)}`}
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={endSession}
                disabled={endingSession}
              >
                {endingSession ? "Ending…" : "End Session"}
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No active session.</p>
          )}
        </CardContent>
      </Card>

      {session && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              Currently Checked In
              <Badge variant="secondary">{attendance.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {attendance.length === 0 ? (
              <p className="text-muted-foreground text-sm">No students checked in yet.</p>
            ) : (
              <ul className="divide-y">
                {attendance.map((row) => (
                  <li
                    key={row.attendance_id}
                    className="py-2 flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="font-medium">{getStudentName(row)}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">
                        in {formatTime(row.check_in_time)}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openCheckout(row)}
                      >
                        Check Out
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Cloud Sync</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={pushNow}
            disabled={pushing || sync?.configured === false}
          >
            {pushing ? "Pushing…" : "Push Now"}
          </Button>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          {!sync ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : !sync.configured ? (
            <p className="text-muted-foreground">
              Not configured — set SYNC_URL and SYNC_TOKEN on the kiosk.
            </p>
          ) : (
            <>
              <p className="text-muted-foreground">
                {sync.last_success_at
                  ? `Last pushed ${formatDateTime(sync.last_success_at)}` +
                    (sync.last_record_count !== null
                      ? ` · ${sync.last_record_count} records`
                      : "")
                  : "Never pushed."}
              </p>
              {sync.last_error && (
                <p className="text-destructive">
                  Last attempt failed: {sync.last_error}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={checkoutRow !== null}
        onOpenChange={(open) => {
          if (!open) setCheckoutRow(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Check out {checkoutRow ? getStudentName(checkoutRow) : ""}?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {checkoutRow &&
                `Checked in at ${formatTime(checkoutRow.check_in_time)}.`}
            </p>

            <div className="space-y-1.5">
              <Label>Check-out time</Label>
              <Input
                type="datetime-local"
                value={checkoutTime}
                min={
                  checkoutRow
                    ? toDateTimeLocal(new Date(checkoutRow.check_in_time))
                    : undefined
                }
                onChange={(e) => {
                  setCheckoutTime(e.target.value);
                  setCheckoutError(null);
                }}
              />
              <p className="text-xs text-muted-foreground">
                {(() => {
                  const mins = checkoutMinutes();
                  if (mins === null) return "Defaults to now — adjust if they left earlier.";
                  if (mins <= 0) return "Check-out must be after check-in.";
                  const h = Math.floor(mins / 60);
                  const m = mins % 60;
                  return `Credits ${h > 0 ? `${h} hr ${m} min` : `${m} min`}.`;
                })()}
              </p>
            </div>

            {checkoutError && (
              <p className="text-sm text-destructive">{checkoutError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCheckoutRow(null)}
              disabled={checkingOut}
            >
              Cancel
            </Button>
            <Button
              onClick={checkOutMember}
              disabled={
                checkingOut ||
                checkoutMinutes() === null ||
                (checkoutMinutes() ?? 0) <= 0
              }
            >
              {checkingOut ? "Checking out…" : "Check Out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Session Name</Label>
              <Input
                placeholder="e.g. Tuesday Build Session"
                value={newSession.session_name}
                onChange={(e) =>
                  setNewSession({ ...newSession, session_name: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={newSession.session_type}
                onValueChange={(v) =>
                  setNewSession({ ...newSession, session_type: v ?? "Regular Build" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SESSION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Location (optional)</Label>
              <Input
                placeholder="e.g. Build Room"
                value={newSession.location}
                onChange={(e) =>
                  setNewSession({ ...newSession, location: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={startSession}
              disabled={!newSession.session_name.trim()}
            >
              Start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
