"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import {
  createStudent,
  updateStudent,
  resetPin,
  archiveStudent,
  restoreStudent,
} from "./actions";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Student = {
  student_id: string;
  first_name: string;
  last_name: string;
  display_name: string | null;
  grade: string | null;
  subteam: string | null;
  role: string | null;
  active_status: number;
};

const MEMBER_TYPES = ["Student", "Mentor", "Coach", "Parent"] as const;
const SUBTEAMS = ["Build", "CAD", "Code", "Documentation", "Outreach"] as const;
const GRADES = ["7", "8", "9"] as const;

const emptyForm = {
  first_name: "",
  last_name: "",
  display_name: "",
  grade: "",
  subteam: "",
  role: "Student",
  pin: "",
};

type DialogMode = "add" | "edit" | "reset_pin" | null;
type SortKey = "name" | "grade" | "subteam" | "role";
type SortDir = "asc" | "desc";

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selected, setSelected] = useState<Student | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const fetchStudents = useCallback(async () => {
    const res = await fetch("/api/admin/students");
    if (!res.ok) return;
    const data = await res.json();
    setStudents(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const openAdd = () => {
    setForm(emptyForm);
    setSelected(null);
    setDialogMode("add");
  };

  const openEdit = (s: Student) => {
    setSelected(s);
    setForm({
      first_name: s.first_name,
      last_name: s.last_name,
      display_name: s.display_name ?? "",
      grade: s.grade ?? "",
      subteam: s.subteam ?? "",
      role: s.role ?? "",
      pin: "",
    });
    setDialogMode("edit");
  };

  const openResetPin = (s: Student) => {
    setSelected(s);
    setForm({ ...emptyForm, pin: "" });
    setDialogMode("reset_pin");
  };

  const closeDialog = () => {
    setDialogMode(null);
    setSelected(null);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    let result: { success?: boolean; error?: string } = {};

    if (dialogMode === "add") {
      result = await createStudent(form);
    } else if (dialogMode === "edit" && selected) {
      result = await updateStudent(selected.student_id, form);
    } else if (dialogMode === "reset_pin" && selected) {
      result = await resetPin(selected.student_id, form.pin);
    }

    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(
        dialogMode === "add"
          ? "Member added."
          : dialogMode === "reset_pin"
          ? "PIN reset."
          : "Student updated."
      );
      closeDialog();
      fetchStudents();
    }
    setSubmitting(false);
  };

  const handleArchive = async (s: Student) => {
    const result = await (s.active_status
      ? archiveStudent(s.student_id)
      : restoreStudent(s.student_id));
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success(s.active_status ? "Student archived." : "Student restored.");
      fetchStudents();
    }
  };

  const displayName = (s: Student) =>
    s.display_name ?? `${s.first_name} ${s.last_name}`;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const visible = useMemo(() => {
    const filtered = students.filter((s) =>
      showArchived ? !s.active_status : s.active_status
    );
    return [...filtered].sort((a, b) => {
      let av = "", bv = "";
      if (sortKey === "name")    { av = displayName(a); bv = displayName(b); }
      if (sortKey === "grade")   { av = a.grade ?? ""; bv = b.grade ?? ""; }
      if (sortKey === "subteam") { av = a.subteam ?? ""; bv = b.subteam ?? ""; }
      if (sortKey === "role")    { av = a.role ?? ""; bv = b.role ?? ""; }
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [students, showArchived, sortKey, sortDir]);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Members</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? "Show Active" : "Show Archived"}
          </Button>
          <Button size="sm" onClick={openAdd}>
            Add Member
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {showArchived ? "No archived members." : "No members yet. Add one!"}
        </p>
      ) : (
        <div className="rounded-lg border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {(["name", "grade", "subteam", "role"] as SortKey[]).map((key) => (
                  <TableHead key={key}>
                    <button
                      type="button"
                      onClick={() => handleSort(key)}
                      className="flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      {key === "name" ? "Name" : key === "grade" ? "Grade" : key === "subteam" ? "Subteam" : "Member Type"}
                      {sortKey === key
                        ? sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                        : <ChevronsUpDown className="w-3 h-3 opacity-40" />}
                    </button>
                  </TableHead>
                ))}
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((s) => (
                <TableRow key={s.student_id}>
                  <TableCell className="font-medium">{displayName(s)}</TableCell>
                  <TableCell>{s.grade ?? "—"}</TableCell>
                  <TableCell>{s.subteam ?? "—"}</TableCell>
                  <TableCell>{s.role ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={s.active_status ? "default" : "secondary"}>
                      {s.active_status ? "Active" : "Archived"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openResetPin(s)}>
                        Reset PIN
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleArchive(s)}>
                        {s.active_status ? "Archive" : "Restore"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogMode !== null} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "add"
                ? "Add Member"
                : dialogMode === "reset_pin"
                ? `Reset PIN — ${selected ? displayName(selected) : ""}`
                : `Edit Student — ${selected ? displayName(selected) : ""}`}
            </DialogTitle>
          </DialogHeader>

          {dialogMode === "reset_pin" ? (
            <div className="space-y-1.5 py-2">
              <Label>New PIN (4 digits)</Label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                pattern="\d{4}"
                placeholder="0000"
                value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value })}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 py-2">
              <div className="space-y-1.5">
                <Label>First Name *</Label>
                <Input
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name *</Label>
                <Input
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Display Name</Label>
                <Input
                  placeholder="Nickname shown on kiosk"
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Member Type</Label>
                <select
                  value={form.role}
                  onChange={(e) => {
                    const role = e.target.value;
                    const isStudent = role === "Student";
                    setForm({ ...form, role, grade: isStudent ? form.grade : "", subteam: isStudent ? form.subteam : "" });
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm"
                >
                  {MEMBER_TYPES.map((t) => (
                    <option key={t} value={t} className="bg-background text-foreground">{t}</option>
                  ))}
                </select>
              </div>
              {form.role === "Student" && (
                <>
                  <div className="space-y-1.5">
                    <Label>Grade</Label>
                    <select
                      value={form.grade}
                      onChange={(e) => setForm({ ...form, grade: e.target.value })}
                      className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm"
                    >
                      <option value="" className="bg-background text-foreground">— Select —</option>
                      {GRADES.map((g) => (
                        <option key={g} value={g} className="bg-background text-foreground">{g}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Subteam</Label>
                    <select
                      value={form.subteam}
                      onChange={(e) => setForm({ ...form, subteam: e.target.value })}
                      className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm"
                    >
                      <option value="" className="bg-background text-foreground">— Select —</option>
                      {SUBTEAMS.map((s) => (
                        <option key={s} value={s} className="bg-background text-foreground">{s}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              {dialogMode === "add" && (
                <div className="space-y-1.5 col-span-2">
                  <Label>PIN (4 digits) *</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    pattern="\d{4}"
                    placeholder="0000"
                    value={form.pin}
                    onChange={(e) => setForm({ ...form, pin: e.target.value })}
                    required
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
