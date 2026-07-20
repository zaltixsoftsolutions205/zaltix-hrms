import {
  TrendingUp,
  IndianRupee,
  BriefcaseBusiness,
  FileText,
  CalendarDays,
  Clock3,
} from "lucide-react";

/* -------------------------------------------------------
   Dashboard Tabs
-------------------------------------------------------- */

const tabs = [
  {
    key: "performance",
    label: "Performance",
    icon: TrendingUp,
  },
  {
    key: "payslip",
    label: "Payslip",
    icon: IndianRupee,
  },
  {
    key: "projects",
    label: "Projects",
    icon: BriefcaseBusiness,
  },
  {
    key: "documents",
    label: "Documents",
    icon: FileText,
  },
  {
    key: "leave",
    label: "Leave",
    icon: CalendarDays,
  },
  {
    key: "attendance",
    label: "Attendance",
    icon: Clock3,
  },
];

export default function DashboardNavbar({
  activeTab,
  onChange,
}) {
  return (
    <div
      className="
      sticky
      top-4
      z-30
      rounded-2xl
      border
      border-gray-200
      bg-white/95
      shadow-sm
      backdrop-blur-md"
    >
      <div
        className="
        flex
        gap-2
        overflow-x-auto
        p-3
        scrollbar-thin
        scrollbar-thumb-gray-300
        scrollbar-track-transparent"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;

          const active = activeTab === tab.key;

          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className={`
                relative
                flex
                min-w-max
                items-center
                gap-2
                rounded-xl
                px-5
                py-3
                text-sm
                font-semibold
                transition-all
                duration-300

                ${
                  active
                    ? "bg-indigo-600 text-white shadow-lg"
                    : "text-gray-600 hover:bg-indigo-50 hover:text-indigo-600"
                }
              `}
            >
              <Icon
                size={18}
                className={`
                  transition-transform
                  duration-300
                  ${active ? "scale-110" : "group-hover:scale-110"}
                `}
              />

              <span>{tab.label}</span>

              {active && (
                <span
                  className="
                  absolute
                  inset-x-3
                  -bottom-1
                  h-1
                  rounded-full
                  bg-white"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}