"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Session = {
  session_id: string;
  session_name: string;
  session_type: string;
  location: string | null;
  session_date: string;
  actual_start_time: string | null;
  actual_end_time: string | null;
  status: string;
  notes: string | null;
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

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  scheduled: "outline",
  ended: "secondary",
  cancelled: "destructive",
};

const emptyForm = {
  session_name: "",
  session_type: "Regular Build",
  location: "",
  session_date: new Date().toISOString().split("T")[0],
  notes: "",
};

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Session | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const fetchSessions = useCallback(async () => {
    const res = await fetch("/api/admin/sessions");
    if (!res.ok) return;
    const data = await res.json();
    setSessions(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ ...emptyForm, session_date: new Date().toISOString().split("T")[0] });
    setDialogOpen(true);
  };

  const openEdit = (s: Session) => {
    setEditTarget(s);
    setForm({
      session_name: s.session_name,
      session_type: s.session_type,
      location: s.location ?? "",
      session_date: s.session_date,
      notes: s.notes ?? "",
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditTarget(null);
  };

  const handleSubmit = async () => {
    if (!form.session_name.trim()) return;
    setSubmitting(true);

    const res = await fetch("/api/admin/sessions", {
      method: editTarget ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(editTarget ? { session_id: editTarget.session_id } : {}),
        session_name: form.session_name.trim(),
        session_type: form.session_type,
        location: form.location.trim() || null,
        session_date: form.session_date,
        notes: form.notes.trim() || null,
      }),
    });

    if (!res.ok) {
      toast.error(editTarget ? "Failed to update session." : "Failed to create session.");
    } else {
      toast.success(editTarget ? "Session updated." : "Session scheduled.");
      closeDialog();
      fetchSessions();
    }
    setSubmitting(false);
  };

  const startSession = async (s: Session) => {
    const res = await fetch("/api/admin/sessions/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: s.session_id }),
    });
    if (!res.ok) toast.error("Failed to start session.");
    else {
      toast.success(`Session "${s.session_name}" started.`);
      fetchSessions();
    }
  };

  const endSession = async (s: Session) => {
    const res = await fetch("/api/admin/sessions/end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: s.session_id }),
    });
    const data = await res.json();
    if (res.ok) {
      toast.success(
        data.missedCount > 0
          ? `Session ended. ${data.missedCount} student(s) marked as missing checkout.`
          : "Session ended."
      );
      fetchSessions();
    } else {
      toast.error("Failed to end session.");
    }
  };

  const cancelSession = async (s: Session) => {
    const res = await fetch("/api/admin/sessions/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: s.session_id }),
    });
    if (!res.ok) toast.error("Failed to cancel session.");
    else {
      toast.success("Session cancelled.");
      fetchSessions();
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sessions</h1>
        <Button size="sm" onClick={openCreate}>
          Schedule Session
        </Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : sessions.length === 0 ? (
        <p className="text-muted-foreground text-sm">No sessions yet.</p>
      ) : (
        <div className="rounded-lg border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.session_id}>
                  <TableCell className="font-medium">{s.session_name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {s.session_type}
                  </TableCell>
                  <TableCell>{formatDate(s.session_date)}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_COLORS[s.status] ?? "outline"}>
                      {s.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                        Edit
                      </Button>
                      {s.status === "scheduled" && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => startSession(s)}>
                            Start
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => cancelSession(s)}>
                            Cancel
                          </Button>
                        </>
                      )}
                      {s.status === "active" && (
                        <Button variant="ghost" size="sm" onClick={() => endSession(s)}>
                          End
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? "Edit Session" : "Schedule Session"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5 col-span-2">
              <Label>Session Name *</Label>
              <Input
                placeholder="e.g. Tuesday Build Session"
                value={form.session_name}
                onChange={(e) => setForm({ ...form, session_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={form.session_type}
                onValueChange={(v) => setForm({ ...form, session_type: v ?? "Regular Build" })}
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
              <Label>Date</Label>
              <Input
                type="date"
                value={form.session_date}
                onChange={(e) => setForm({ ...form, session_date: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Location</Label>
              <Input
                placeholder="e.g. Build Room"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Optional session notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !form.session_name.trim()}
            >
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
