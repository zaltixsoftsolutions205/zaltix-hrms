import React from "react";
import { useState, useEffect, useCallback } from "react";
import api from "../../utils/api";
import toast from 'react-hot-toast';
import PayslipsPage from "../Payslips/PayslipsPage"
import AttendancePage from "../Attendance/AttendancePage";
import AutomationPage from "../Admin/AutomationPage";
import { motion } from "framer-motion";
import LeavePage from "../Leaves/LeavePage";
import {
  User,
  Briefcase,
  Calendar,
  CreditCard,
  Shield,
  FileText,
  Clock,
  Eye,
  Download,
  MapPin,
} from "lucide-react";

const TabContent = ({ activeTab, employeeId }) => {

  const Card = ({ title, children }) => (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 p-6">
      <h3 className="text-lg font-semibold text-gray-800 mb-5">
        {title}
      </h3>
      {children}
    </div>
  );

  const Field = ({ label, value }) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-3 border-b last:border-none border-gray-100">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="font-medium text-gray-800">
        {value || "-"}
      </span>
    </div>
  );

  const [DocEmployee, setDocEmployee] = useState(null);
  const [performance, setPerformance] = useState(null);



  useEffect(() => {
    if (!employeeId) return;

    const load = async () => {
      try {
        const [documentsRes, performanceRes] = await Promise.all([
          api.get(`/documents/employee/${employeeId}`),
          api.get(`/automation/scores/${employeeId}`),
        ]);

        setPerformance(performanceRes.data);
        setDocEmployee(documentsRes.data);
      } catch (err) {
        toast.error("Failed to load data");
      }
    };

    load();
  }, [employeeId]);

  console.log(performance);

  const currentTab =
    DocEmployee ? activeTab : "default";

  const handleViewDocument = async (id) => {
    try {
      const res = await api.get(`/documents/${id}/download`, {
        responseType: "blob",
      });

      const blobUrl = URL.createObjectURL(new Blob([res.data], { type: "application/pdf", })
      );
      window.open(blobUrl, "_blank");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch (err) {
      toast.error(err.response?.data?.message || "Unable to open document");
    }
  };


  const handleDownloadDocument = async (id, name) => {
    try {
      const res = await api.get(`/documents/${id}/download`, { responseType: "blob", });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Document downloaded");
    } catch (err) {
      toast.error(err.response?.data?.message || "Download failed");
    }
  };

  const latest = performance?.scores?.[0];

  const grade = latest
    ? latest.totalScore >= 90
      ? { label: "Excellent", cls: "text-green-600", bg: "bg-green-50", bar: "bg-green-500" }
      : latest.totalScore >= 75
        ? { label: "Good", cls: "text-violet-600", bg: "bg-violet-50", bar: "bg-violet-600" }
        : latest.totalScore >= 60
          ? { label: "Average", cls: "text-amber-600", bg: "bg-amber-50", bar: "bg-amber-500" }
          : { label: "Needs Improvement", cls: "text-red-600", bg: "bg-red-50", bar: "bg-red-500" }
    : null;

  switch (currentTab) {
    case "performance": {
      const latest = performance?.scores?.[0];

      if (!latest) {
        return (
          <Card title="Employee Performance">
            <div className="flex h-52 items-center justify-center text-gray-500">
              No performance data available.
            </div>
          </Card>
        );
      }

      const grade =
        latest.totalScore >= 90
          ? {
            label: "Excellent",
            cls: "text-green-600",
            bg: "bg-green-50",
            bar: "bg-green-500",
          }
          : latest.totalScore >= 75
            ? {
              label: "Good",
              cls: "text-violet-600",
              bg: "bg-violet-50",
              bar: "bg-violet-600",
            }
            : latest.totalScore >= 50
              ? {
                label: "Average",
                cls: "text-amber-600",
                bg: "bg-amber-50",
                bar: "bg-amber-500",
              }
              : {
                label: "Needs Improvement",
                cls: "text-red-600",
                bg: "bg-red-50",
                bar: "bg-red-500",
              };

      return (
        <Card title="Employee Performance">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">

              {/* Header */}
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-xl font-bold text-gray-800">
                  📊 {performance.employee.name}
                </h2>

                <p className="mt-1 text-sm text-gray-500">
                  {performance.employee.employeeId} • {performance.employee.role}
                </p>

                <p className="text-sm text-gray-500">
                  Week : {latest.week}
                </p>
              </div>

              <div className="p-6">

                {/* Score */}
                <div className="mb-8 flex items-center gap-6">

                  <div
                    className={`flex h-24 w-24 flex-col items-center justify-center rounded-3xl ${grade.bg}`}
                  >
                    <span className={`text-4xl font-bold ${grade.cls}`}>
                      {latest.totalScore}
                    </span>

                    <span className={`text-sm ${grade.cls}`}>
                      /100
                    </span>
                  </div>

                  <div>
                    <h3 className={`text-2xl font-bold ${grade.cls}`}>
                      {grade.label}
                    </h3>

                    <p className="text-gray-500">
                      Overall Productivity Score
                    </p>
                  </div>

                </div>

                {/* Progress Bars */}

                {[
                  {
                    label: "Task Performance",
                    value: latest.taskScore,
                    details: `${latest.tasksCompleted}/${latest.tasksTotal} Completed`,
                  },
                  {
                    label: "Attendance",
                    value: latest.attendanceScore,
                    details: `${latest.attendanceDays}/${latest.workingDays} Days Present`,
                  },
                  ...(latest.crmScore != null
                    ? [
                      {
                        label: "CRM",
                        value: latest.crmScore,
                        details: `${latest.leadsConverted}/${latest.leadsTotal} Converted`,
                      },
                    ]
                    : []),
                ].map((item) => (
                  <div key={item.label} className="mb-6">

                    <div className="mb-2 flex justify-between text-sm">
                      <span className="font-medium">
                        {item.label}
                      </span>

                      <span className="font-semibold">
                        {item.value}%
                      </span>
                    </div>

                    <div className="h-3 overflow-hidden rounded-full bg-gray-200">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${item.value}%` }}
                        transition={{ duration: 0.8 }}
                        className={`h-full ${grade.bar}`}
                      />
                    </div>

                    <p className="mt-1 text-xs text-gray-500">
                      {item.details}
                    </p>

                  </div>
                ))}

                {/* Statistics */}

                <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

                  <div className="rounded-xl border p-4">
                    <p className="text-xs text-gray-500">
                      Tasks Completed
                    </p>

                    <h2 className="text-2xl font-bold">
                      {latest.tasksCompleted}
                    </h2>
                  </div>

                  <div className="rounded-xl border p-4">
                    <p className="text-xs text-gray-500">
                      Total Tasks
                    </p>

                    <h2 className="text-2xl font-bold">
                      {latest.tasksTotal}
                    </h2>
                  </div>

                  <div className="rounded-xl border p-4">
                    <p className="text-xs text-gray-500">
                      Working Days
                    </p>

                    <h2 className="text-2xl font-bold">
                      {latest.workingDays}
                    </h2>
                  </div>

                  <div className="rounded-xl border p-4">
                    <p className="text-xs text-gray-500">
                      Late Days
                    </p>

                    <h2 className="text-2xl font-bold text-red-500">
                      {latest.lateDays}
                    </h2>
                  </div>

                </div>

              </div>

            </div>
          </motion.div>
        </Card>
      );
    }
    case "leave":
      return (
        <Card title="leave Information">
          <LeavePage employeeId={employeeId} />
        </Card>
      );

    case "projects":
      return (
        <Card title="Job Details">
          <div className="grid md:grid-cols-2 gap-6">
            {/* <Field label="Department" value={employee?.department?.name} />
            <Field label="Designation" value={employee?.designation} />
            <Field label="Role" value={employee?.role} />
            <Field label="Employee Type" value={employee?.employeeType} />
            <Field label="Joining Date" value={employee?.joiningDate} />
            <Field label="Status" value={employee?.isActive ? "Active" : "Inactive"} /> */}
          </div>
        </Card>
      );

    case "payslip":
      return (
        <Card title="Salary Information">
          <PayslipsPage employeeId={employeeId} />
        </Card>
      );

    case "attendance":
      return (
        <Card title="Attendance">
          <AttendancePage employeeId={employeeId} />
        </Card>
      );

    case "documents":
      return (

        <Card title="Employee Documents">
          {DocEmployee?.docs?.length > 0 ? (
            <div className="space-y-4">
              {DocEmployee.docs.map((doc, index) => {
                const uploaded = doc.status === "uploaded";

                return (
                  <div
                    key={doc._id || index}
                    className={`
          flex items-center justify-between rounded-xl border p-4 transition-all duration-300
          ${uploaded
                        ? "border-gray-200 hover:bg-violet-50 hover:border-violet-300"
                        : "border-dashed border-gray-300 bg-gray-50 opacity-70"
                      }
                  `}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`
              rounded-lg p-3
              ${uploaded
                            ? "bg-violet-100"
                            : "bg-gray-200"
                          }
                     `}
                      >
                        <FileText
                          className={`h-6 w-6 ${uploaded ? "text-violet-600" : "text-gray-400"
                            }`}
                        />
                      </div>

                      <div>
                        <h4
                          className={`font-semibold ${uploaded ? "text-gray-800" : "text-gray-500"
                            }`}
                        >
                          {doc.docType}
                        </h4>

                        <p className="text-sm">
                          Status :
                          <span
                            className={`ml-2 font-medium ${uploaded
                              ? "text-green-600"
                              : "text-amber-600"
                              }`}
                          >
                            {uploaded ? "Uploaded" : "Pending Upload"}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        disabled={!uploaded}
                        onClick={() => handleViewDocument(doc._id)}
                        className={`
              flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all
              ${uploaded
                            ? "bg-violet-100 text-violet-700 hover:bg-violet-600 hover:text-white"
                            : "bg-gray-200 text-gray-400 cursor-not-allowed"
                          }
            `}
                      >
                        <Eye size={16} />
                        View
                      </button>

                      <button
                        disabled={!uploaded}
                        onClick={() =>
                          handleDownloadDocument(doc._id, doc.docType)
                        }
                        className={`
              flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all
              ${uploaded
                            ? "bg-green-100 text-green-700 hover:bg-green-600 hover:text-white"
                            : "bg-gray-200 text-gray-400 cursor-not-allowed"
                          }
            `}
                      >
                        <Download size={16} />
                        Download
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-10 text-center text-gray-500">
              No documents uploaded.
            </div>
          )}
        </Card>
      );

    default:
      return (
        <Card title="Overview">
          <div className="flex flex-col items-center justify-center py-16 text-center">

            <Shield className="h-14 w-14 text-red-500 mb-4" />

            <h2 className="text-xl font-semibold text-gray-800">
              Access Restricted
            </h2>

            <p className="mt-2 max-w-md text-gray-500">
              You don't have permission to view this information for the selected employee.
            </p>

          </div>
        </Card>
      );
  }
};

export default TabContent;