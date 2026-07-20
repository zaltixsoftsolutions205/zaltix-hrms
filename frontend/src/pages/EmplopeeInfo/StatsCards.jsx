import { TrendingUp, IndianRupee, BriefcaseBusiness, Clock3, } from "lucide-react";
import api from "../../utils/api";

import { useEffect, useState } from "react";

/* ------------------------------------------
   Reusable Stat Card
------------------------------------------- */

function StatCard({
  icon: Icon,
  title,
  value,
  subtitle,
  progress,
  progressColor = "bg-indigo-600",
  iconBg = "bg-indigo-100",
  iconColor = "text-indigo-600",
  trend,
}) {
  return (
    <div className=" group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">
            {title}
          </p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">
            {value}
          </h2>
        </div>
        <div className={` flex h-14 w-14 items-center justify-center rounded-xl ${iconBg} ${iconColor} transition-transform duration-300 group-hover:scale-110 `} >
          <Icon size={28} />
        </div>
      </div>

      {/* Subtitle */}

      <div className="mt-3 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {subtitle}
        </p>
        {trend && (
          <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-700">
            ↑ {trend}
          </span>
        )}
      </div>

      {/* Progress */}

      {progress !== undefined && (
        <div className="mt-5">
          <div className="mb-2 flex justify-between text-xs text-gray-500">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200">
            <div
              className={`${progressColor} h-full rounded-full transition-all duration-700`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------
   Main Component
------------------------------------------- */

export default function StatsCards({ employeeId, }) {

  const [performance, setPerformance] = useState({});
  const [leaveData, setLeaveData] = useState(null);
  const [attendanceData, setAttendanceData] = useState(null);
  const [payslipData, setpayslipData] = useState(null);

  useEffect(() => {
    if (!employeeId) return;

    const load = async () => {
      try {
        const [payslipRes, leavesRes, attendanceRes, performanceRes] = await Promise.all([
          api.get(`/payslips/my/${employeeId}/showall`),
          api.get(`/leaves/my/${employeeId}`),
          api.get(`/attendance/my/${employeeId}`),
          api.get(`/automation/scores/${employeeId}`),
        ]);

        // setEmployeeData(payslipsRes.data);
        setPerformance(performanceRes.data.scores[0] || {});
        setLeaveData(leavesRes.data);
        setAttendanceData(attendanceRes.data);
        setpayslipData(payslipRes.data);
      } catch (err) {
        toast.error("Failed to load data");
      }
    };
    load();
  }, [employeeId]);

  // console.log(employeeData)
  console.log(performance.totalScore)
  console.log(leaveData)
  console.log(attendanceData)
  // create netSalary
  const netSalary = payslipData?.reduce((sum, p) => sum + (p.netSalary || 0), 0) || 0;

  const attendance = attendanceData?.summary;

  const totalDays =
    (attendance?.present || 0) +
    (attendance?.absent || 0) +
    (attendance?.halfDay || 0);

  const attendancePercentage =
    totalDays > 0
      ? (
        ((attendance.present + attendance.halfDay * 0.5) / totalDays) *
        100
      ).toFixed(1)
      : 0;
  const totalLeaves = leaveData?.leaves?.length || 0;

  console.log(totalLeaves);

  return (
    <section className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard icon={TrendingUp} title="Performance" value={`${performance.totalScore ?? 0}%`} subtitle={`Week: ${performance.week ?? "-"}`} progress={performance?.totalScore ?? 0} progressColor="bg-indigo-600" iconBg="bg-indigo-100" iconColor="text-indigo-600" />
      <StatCard icon={IndianRupee} title="Net Salary" value={netSalary} subtitle="Salary for this Month" iconBg="bg-green-100" iconColor="text-green-600" />
      <StatCard icon={Clock3} title="Attendance" value={`${attendancePercentage}%`} subtitle="Current Month" progress={attendancePercentage} progressColor="bg-cyan-500" iconBg="bg-cyan-100" iconColor="text-cyan-600" />
      <StatCard icon={BriefcaseBusiness} title="Total Leaves" value={totalLeaves} subtitle=" No Of Leave This Mouth" progressColor="bg-orange-500" iconBg="bg-orange-100" iconColor="text-orange-600" />
    </section>
  );
}