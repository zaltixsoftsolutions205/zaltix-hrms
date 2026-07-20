// import { createFileRoute } from "tanstack/react-router";
import { useState, useEffect } from "react";
import HeroProfile from "../EmplopeeInfo/HeroProfile.jsx";
import StatsCards from "../EmplopeeInfo/StatsCards.jsx";
import { useParams } from "react-router-dom";
import DashboardNavbar from "../EmplopeeInfo/DashboardNavbar.jsx";
import TabContent from "../EmplopeeInfo/TabContent.jsx";

// Route definition + page metadata for the employee dashboard.
// export const Route = createFileRoute("/")({
//   head: () => ({
//     meta: [
//       { title: "Employee Profile — HR Dashboard" },
//       { name: "description", content: "Employee profile with performance, payroll, projects, documents, leave and attendance." },
//     ],
//   }),
//   component: EmployeeDashboard,
// });

// Mock employee record used across all child components.
const employee = {
  name: "Aditi Sharma",
  id: "EMP-10245",
  email: "aditi.sharma@company.com",
  phone: "+91 98214 55120",
  location: "Bengaluru, IN",
  department: "Design",
  reportsTo: "Rohan Mehta",
  joined: "12 Aug 2021",
  experience: "5 yrs 2 mo",
  role: "Senior Product Designer",
  status: "Active",
};


// Quick-glance KPI values shown in the stat cards.
const stats = {
  performance: 88,
  netSalary: "₹1,18,450",
  activeProjects: 3,
  attendance: 96,
};

// Root page component — composes the 4 dashboard sections.
function EmployeeDashboard() {
  // Which tab is currently active in the dashboard navbar.
  const [activeTab, setActiveTab] = useState("performance");

  const { employeeId } = useParams();
  // Simple JS-driven fade-in animation on first mount.
  useEffect(() => {
    const nodes = document.querySelectorAll("[data-animate]");
    nodes.forEach((el, i) => {
      el.style.opacity = "0";
      el.style.transform = "translateY(12px)";
      el.style.transition = "opacity 500ms ease, transform 500ms ease";
      setTimeout(() => {
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
      }, 80 * i);
    });
  }, []);

  return (
    <div className="min-h-screen bg-background w-full">
      <div className="container mx-auto px-4 py-6 sm:px-6 lg:px-8 flex flex-col gap-6 w-full">
        <div data-animate><HeroProfile employeeId={employeeId} /></div>
        <div data-animate className="mt-4"><StatsCards  employeeId={employeeId}/></div>
        <div data-animate className="mt-4">
          <DashboardNavbar activeTab={activeTab} onChange={setActiveTab} />
        </div>
        <div data-animate className="mt-3"><TabContent activeTab={activeTab} employeeId={employeeId} /></div>
      </div>
    </div>
  );
}
export default EmployeeDashboard;