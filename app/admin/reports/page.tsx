"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type StudentSummary = {
  student_id: string;
  name: string;
  grade: string | null;
  subteam: string | null;
  total_minutes: number;
  session_count: number;
};

export default function ReportsPage() {
  const [summaries, setSummaries] = useState<StudentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"month" | "season">("season");
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/reports?period=${period}`);
    if (res.ok) {
      const data = await res.json();
      setSummaries(data);
    }
    setLoading(false);
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const exportCsv = async () => {
    setExporting(true);
    const res = await fetch(`/api/admin/reports/export?period=${period}`);
    if (!res.ok) {
      setExporting(false);
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const cd = res.headers.get("Content-Disposition") ?? "";
    const match = cd.match(/filename="([^"]+)"/);
    a.download = match ? match[1] : "attendance.csv";
    a.click();
    URL.revokeObjectURL(a.href);
    setExporting(false);
  };

  const toHours = (m: number) => (m / 60).toFixed(1);

  const totalStudents = summaries.length;
  const totalHours = summaries.reduce((s, r) => s + r.total_minutes, 0) / 60;
  const avgHours = totalStudents ? totalHours / totalStudents : 0;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Reports</h1>
        <div className="flex gap-2 items-center">
          <div className="flex rounded-lg border overflow-hidden">
            <button
              className={`px-3 py-1.5 text-sm transition-colors ${
                period === "season"
                  ? "bg-foreground text-background"
                  : "hover:bg-muted"
              }`}
              onClick={() => setPeriod("season")}
            >
              Season
            </button>
            <button
              className={`px-3 py-1.5 text-sm transition-colors ${
                period === "month"
                  ? "bg-foreground text-background"
                  : "hover:bg-muted"
              }`}
              onClick={() => setPeriod("month")}
            >
              This Month
            </button>
          </div>
          <Button size="sm" onClick={exportCsv} disabled={exporting || loading}>
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Students
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalStudents}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Total Hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalHours.toFixed(1)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground font-normal">
              Avg Hours / Student
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{avgHours.toFixed(1)}</p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : summaries.length === 0 ? (
        <p className="text-muted-foreground text-sm">No attendance data for this period.</p>
      ) : (
        <div className="rounded-lg border overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Subteam</TableHead>
                <TableHead>Sessions</TableHead>
                <TableHead className="text-right">Hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summaries.map((s, i) => (
                <TableRow key={s.student_id}>
                  <TableCell className="text-muted-foreground text-sm">
                    {i + 1}
                  </TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.grade ?? "—"}</TableCell>
                  <TableCell>
                    {s.subteam ? (
                      <Badge variant="secondary">{s.subteam}</Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{s.session_count}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {toHours(s.total_minutes)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
