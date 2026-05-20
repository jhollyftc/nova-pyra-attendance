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
import { getAllSeasons, getCurrentSeason } from "@/lib/seasons";

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

type AdultSummary = {
  student_id: string;
  name: string;
  role: string;
  total_minutes: number;
  session_count: number;
};

type AdultCategoryRow = {
  role: string;
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

// Build the option list once (newest season first, then "This Month")
const now = new Date();
const SEASON_OPTIONS = [
  ...getAllSeasons().map((s) => ({
    label: s.name,
    from: s.start.toISOString(),
    to: s.end.toISOString(),
  })),
  {
    label: "This Month",
    from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
    to: null as string | null,
  },
];
const CURRENT_SEASON_LABEL = getCurrentSeason(now).name;

export default function ReportsPage() {
  const [summaries, setSummaries] = useState<StudentSummary[]>([]);
  const [sessionTrend, setSessionTrend] = useState<SessionTrend[]>([]);
  const [subteamBreakdown, setSubteamBreakdown] = useState<SubteamRow[]>([]);
  const [adultSummaries, setAdultSummaries] = useState<AdultSummary[]>([]);
  const [adultCategoryBreakdown, setAdultCategoryBreakdown] = useState<AdultCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLabel, setSelectedLabel] = useState(CURRENT_SEASON_LABEL);
  const [exporting, setExporting] = useState(false);

  const selected = SEASON_OPTIONS.find((o) => o.label === selectedLabel) ?? SEASON_OPTIONS[0];

  const apiUrl = useCallback((base: string) => {
    const url = new URL(base, "http://x");
    url.searchParams.set("from", selected.from);
    if (selected.to) url.searchParams.set("to", selected.to);
    url.searchParams.set("label", selected.label);
    return url.pathname + url.search;
  }, [selected]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const res = await fetch(apiUrl("/api/admin/reports"));
    if (res.ok) {
      const data = await res.json();
      setSummaries(data.summaries ?? []);
      setSessionTrend(data.sessionTrend ?? []);
      setSubteamBreakdown(data.subteamBreakdown ?? []);
      setAdultSummaries(data.adultSummaries ?? []);
      setAdultCategoryBreakdown(data.adultCategoryBreakdown ?? []);
    }
    setLoading(false);
  }, [apiUrl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const exportCsv = async () => {
    setExporting(true);
    const res = await fetch(apiUrl("/api/admin/reports/export"));
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

  const trendData = sessionTrend.map((s) => ({
    label: new Date(s.session_date + "T12:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric",
    }),
    count: s.student_count,
    name: s.session_name,
  }));

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
          <select
            value={selectedLabel}
            onChange={(e) => setSelectedLabel(e.target.value)}
            className="rounded-lg border border-border bg-background text-foreground text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {SEASON_OPTIONS.map((o) => (
              <option key={o.label} value={o.label}>{o.label}</option>
            ))}
          </select>
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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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

          {/* Adult Hours */}
          {adultSummaries.length > 0 && (
            <>
              <div className="flex items-center gap-3 pt-2">
                <h2 className="text-lg font-bold">Adult Hours</h2>
                <div className="flex gap-3 text-sm text-muted-foreground">
                  {adultCategoryBreakdown.map((c) => (
                    <span key={c.role}>
                      <span className="font-medium text-foreground">{c.hours}h</span> {c.role}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Sessions</TableHead>
                      <TableHead className="text-right">Hours</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adultSummaries.map((a) => (
                      <TableRow key={a.student_id}>
                        <TableCell className="font-medium">{a.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{a.role}</Badge>
                        </TableCell>
                        <TableCell>{a.session_count}</TableCell>
                        <TableCell className="text-right font-semibold">{toHours(a.total_minutes)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
