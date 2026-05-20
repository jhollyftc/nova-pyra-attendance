"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { correctAttendance, voidAttendance } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AttendanceRecord = {
  attendance_id: string;
  check_in_time: string;
  check_out_time: string | null;
  total_minutes: number | null;
  status: string;
  edit_reason: string | null;
  student_display_name: string | null;
  student_first_name: string;
  student_last_name: string;
  session_name: string;
  session_date: string;
};

const STATUS_COLOR: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  checked_in: "default",
  checked_out: "secondary",
  missing_checkout: "destructive",
  manual_fixed: "outline",
  voided: "destructive",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editTarget, setEditTarget] = useState<AttendanceRecord | null>(null);
  const [editForm, setEditForm] = useState({
    check_in_time: "",
    check_out_time: "",
    edit_reason: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchRecords = useCallback(async () => {
    const res = await fetch("/api/admin/attendance");
    if (!res.ok) return;
    const data = await res.json();
    setRecords(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const openEdit = (r: AttendanceRecord) => {
    setEditTarget(r);
    setEditForm({
      check_in_time: toLocalInput(r.check_in_time),
      check_out_time: r.check_out_time
        ? toLocalInput(r.check_out_time)
        : toLocalInput(r.check_in_time),
      edit_reason: "",
    });
  };

  const handleCorrect = async () => {
    if (!editTarget) return;
    setSubmitting(true);
    const result = await correctAttendance(
      editTarget.attendance_id,
      new Date(editForm.check_in_time).toISOString(),
      new Date(editForm.check_out_time).toISOString(),
      editForm.edit_reason
    );
    if (result.error) toast.error(result.error);
    else {
      toast.success("Record corrected.");
      setEditTarget(null);
      fetchRecords();
    }
    setSubmitting(false);
  };

  const handleVoid = async (r: AttendanceRecord) => {
    const reason = prompt("Reason for voiding this record:");
    if (!reason?.trim()) return;
    const result = await voidAttendance(r.attendance_id, reason);
    if (result.error) toast.error(result.error);
    else {
      toast.success("Record voided.");
      fetchRecords();
    }
  };

  const studentName = (r: AttendanceRecord) =>
    r.student_display_name ??
    `${r.student_first_name} ${r.student_last_name}`.trim();

  const filtered = records.filter((r) => {
    const matchSearch =
      !search ||
      studentName(r).toLowerCase().includes(search.toLowerCase()) ||
      r.session_name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || r.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const durationStr = (mins: number | null) => {
    if (!mins) return "—";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="max-w-6xl space-y-6">
      <h1 className="text-2xl font-bold">Attendance Records</h1>

      <div className="flex flex-wrap gap-3">
        <Input
          className="w-56"
          placeholder="Search student or session…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="checked_in">Checked In</option>
          <option value="checked_out">Checked Out</option>
          <option value="missing_checkout">Missing Checkout</option>
          <option value="manual_fixed">Manual Fixed</option>
          <option value="voided">Voided</option>
        </select>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-sm">No records found.</p>
      ) : (
        <div className="rounded-lg border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Check In</TableHead>
                <TableHead>Check Out</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.attendance_id}>
                  <TableCell className="font-medium">{studentName(r)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {r.session_name}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatDateTime(r.check_in_time)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.check_out_time ? formatDateTime(r.check_out_time) : "—"}
                  </TableCell>
                  <TableCell>{durationStr(r.total_minutes)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLOR[r.status] ?? "outline"}>
                      {r.status.replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.status !== "voided" && (
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                          Correct
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleVoid(r)}>
                          Void
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Correct Attendance — {editTarget ? studentName(editTarget) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Check In Time</Label>
              <Input
                type="datetime-local"
                value={editForm.check_in_time}
                onChange={(e) =>
                  setEditForm({ ...editForm, check_in_time: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Check Out Time</Label>
              <Input
                type="datetime-local"
                value={editForm.check_out_time}
                onChange={(e) =>
                  setEditForm({ ...editForm, check_out_time: e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Reason for Edit *</Label>
              <Textarea
                placeholder="e.g. Student forgot to check out"
                value={editForm.edit_reason}
                onChange={(e) =>
                  setEditForm({ ...editForm, edit_reason: e.target.value })
                }
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleCorrect}
              disabled={submitting || !editForm.edit_reason.trim()}
            >
              {submitting ? "Saving…" : "Save Correction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
