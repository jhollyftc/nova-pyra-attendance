"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  LineChart, Line, CartesianGrid,
} from "recharts";

type StudentSummary = {
  student_id: string;
  name: string;
  grade: string | null;
  subteam: string | null;
  total_minutes: number;
  session_count: number;
};

type SessionTrend = {
  session_name: string;
  session_date: string;
  student_count: number;
};

type SubteamRow = {
  subteam: string;
  hours: number;
};

const CHART_COLORS = {
  bar: "#1173F1",
  line: "#1173F1",
  subteam: "#0A4FB3",
};

const tooltipStyle = {
  backgroundColor: "#1f2937",
  border: "1px solid #374151",
  borderRadius: "8px",
  color: "#f9fafb",
};

export default function ReportsPage() {
  const [summaries, setSummaries] = useState<StudentSummary[]>([]);
  const [sessionTrend, setSessionTrend] = useState<SessionTrend[]>([]);
  const [subteamBreakdown, setSubteamBreakdown] = useState<SubteamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"month" | "season">("season");
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/reports?period=${period}`);
    if (res.ok) {
      const data = await res.json();
      setSummaries(data.summaries ?? []);
      setSessionTrend(data.sessionTrend ?? []);
      setSubteamBreakdown(data.subteamBreakdown ?? []);
    }
    setLoading(false);
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const exportCsv = async () => {
    setExporting(true);
    const res = await fetch(`/api/admin/reports/export?period=${period}`);
    if (!res.ok) { setExporting(false); return; }
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

  // Format session date for trend chart x-axis
  const trendData = sessionTrend.map((s) => ({
    label: new Date(s.session_date + "T12:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric",
    }),
    count: s.student_count,
    name: s.session_name,
  }));

  // Hours by student for horizontal bar chart
  const studentBarData = summaries.map((s) => ({
    name: s.name,
    hours: parseFloat(toHours(s.total_minutes)),
  }));

  const barHeight = Math.max(280, studentBarData.length * 36);

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Reports</h1>
        <div className="flex gap-2 items-center">
          <div className="flex rounded-lg border overflow-hidden">
            <button
              className={`px-3 py-1.5 text-sm transition-colors ${period === "season" ? "bg-foreground text-background" : "hover:bg-muted"}`}
              onClick={() => setPeriod("season")}
            >
              Season
            </button>
            <button
              className={`px-3 py-1.5 text-sm transition-colors ${period === "month" ? "bg-foreground text-background" : "hover:bg-muted"}`}
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

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground font-normal">Students</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalStudents}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground font-normal">Total Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{totalHours.toFixed(1)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm text-muted-foreground font-normal">Avg Hours / Student</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{avgHours.toFixed(1)}</p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <>
          {/* Session attendance trend */}
          {trendData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Attendance Per Session</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trendData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#9ca3af" }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#9ca3af" }} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v) => [v, "Students"]}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.name ?? ""}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke={CHART_COLORS.line}
                      strokeWidth={2}
                      dot={{ r: 4, fill: CHART_COLORS.line }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Hours by student + Subteam breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Hours by student — horizontal bar */}
            {studentBarData.length > 0 && (
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Hours by Student</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={barHeight}>
                    <BarChart
                      layout="vertical"
                      data={studentBarData}
                      margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
                    >
                      <XAxis type="number" tick={{ fontSize: 12, fill: "#9ca3af" }} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={100}
                        tick={{ fontSize: 12, fill: "#d1d5db" }}
                      />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(v) => [`${v} hrs`, "Hours"]}
                      />
                      <Bar dataKey="hours" fill={CHART_COLORS.bar} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Subteam breakdown */}
            {subteamBreakdown.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Hours by Subteam</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={barHeight}>
                    <BarChart
                      data={subteamBreakdown}
                      margin={{ top: 0, right: 8, left: -16, bottom: 40 }}
                    >
                      <XAxis
                        dataKey="subteam"
                        tick={{ fontSize: 11, fill: "#d1d5db" }}
                        angle={-35}
                        textAnchor="end"
                      />
                      <YAxis tick={{ fontSize: 12, fill: "#9ca3af" }} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        formatter={(v) => [`${v} hrs`, "Hours"]}
                      />
                      <Bar dataKey="hours" fill={CHART_COLORS.subteam} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Student table */}
          {summaries.length === 0 ? (
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
                      <TableCell className="text-muted-foreground text-sm">{i + 1}</TableCell>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell>{s.grade ?? "—"}</TableCell>
                      <TableCell>
                        {s.subteam ? <Badge variant="secondary">{s.subteam}</Badge> : "—"}
                      </TableCell>
                      <TableCell>{s.session_count}</TableCell>
                      <TableCell className="text-right font-semibold">{toHours(s.total_minutes)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
