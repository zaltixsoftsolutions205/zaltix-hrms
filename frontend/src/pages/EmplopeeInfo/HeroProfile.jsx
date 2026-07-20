import { Mail, Phone, MapPin, Building2, CalendarDays, IdCard, User, Award, Pencil, Download, MessageCircle, } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { useChat } from "../../contexts/ChatContext";
import html2pdf from "html2pdf.js";


import api from "../../utils/api";
function InfoCard({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
      <div className=" flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary" >
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="truncate font-semibold text-foreground">
          {value}
        </p>
      </div>
    </div>
  );
}

export default function HeroProfile({ employeeId }) {
  const { openChat, setIsOpen } = useChat();
  const [data, setData] = useState(null);
  const profileRef = useRef(null);


  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get(`/employees/${employeeId}`);
        setData(res.data);
      } catch (err) {
        toast.error("Failed to load employee");
      }
    };

    load();
  }, [employeeId]);
  const handleMessage = () => {
    openChat({
      type: "direct",
      id: data._id,
      name: data.name,
      role: data.role,
      pic: data.profilePicture, // or data.profileImage if that's your field
    });

    setIsOpen(true); // opens the chat widget
  };
  const downloadPDF = () => {
    if (!profileRef.current) return;

    const options = {
      margin: 0.4,
      filename: `${data.name}_Profile.pdf`,
      image: {
        type: "jpeg",
        quality: 1,
      },
      html2canvas: {
        scale: 2,
        useCORS: true,
        scrollY: 0,
      },
      jsPDF: {
        unit: "in",
        format: "a4",
        orientation: "portrait",
      },
    };

    html2pdf()
      .set(options)
      .from(profileRef.current)
      .save();
  };


  if (!data) return <div>Loading...</div>;


  const NA = "N/A";
  const initials = data.name
    .split(" ")
    .map((n) => n[0])
    .join("");

  return (
    <section ref={profileRef} className=" overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
      {/* Banner */}
      <div className=" relative h-40 bg-gradient-to-r from-violet-600 via-indigo-600 to-cyan-500" />
      {/* Body */}
      <div className="px-8 pb-8 flex flex-col gap-6">
        {/* Top Row */}
        <div className=" -mt-16 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          {/* Left */}
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
            {/* Avatar */}
            <div className=" flex h-32 w-32 z-10 items-center justify-center rounded-full border-2 border-background bg-primar text-4xl font-bold text-primary-foreground shadow-xl">
              {initials}
            </div>

            <div>
              <div className="flex flex-wrap items-center text-white gap-3">
                <h1 className="text-3xl font-bold z-10">
                  {data.name || NA}
                </h1>

                <span
                  className={`rounded-full px-3 py-1 text-sm font-medium z-10 ${data.isActive
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                    }`}
                >
                  {data.isActive ? "🟢 Active" : "🔴 Inactive"}
                </span>
              </div>

              <p className="mt-4  text-lg text-muted-foreground ">
                {data.role || NA}
              </p>

              <div className="mt-2 flex flex-wrap gap-2">

                <span className=" rounded-full bg-primary/10  text-sm font-medium text-primary">
                  {data.department?.name || NA}
                </span>

                <span className=" rounded-full border border-border  text-sm">
                  {data.employeeId || NA}
                </span>
              </div>
            </div>
          </div>

          {/* Right */}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={downloadPDF}
              className="flex items-center gap-2 rounded-xl border border-border bg-background px-5 py-3 transition hover:bg-violet-600 hover:text-white hover:border-violet-600"
            >
              <Download size={18} />
              Download
            </button>
            <button
              onClick={handleMessage}
              className="flex items-center gap-2 rounded-xl border border-border bg-background px-5 py-3 transition hover:bg-violet-600 hover:text-white hover:border-violet-600"
            >
              <MessageCircle size={18} />
              Message
            </button>
          </div>

        </div>

        {/* Information */}

        <div
          className="
          mt-10
          grid
          gap-5
          sm:grid-cols-2
          xl:grid-cols-3"
        >

          <InfoCard
            icon={Mail}
            label="Email"
            value={data.email || NA}
          />

          <InfoCard
            icon={Phone}
            label="Phone"
            value={data.phone || NA}
          />

          <InfoCard
            icon={MapPin}
            label="Location"
            value={data.location || NA}
          />

          <InfoCard
            icon={Building2}
            label="Department"
            value={data.department?.name || NA}
          />

          {/* <InfoCard
            icon={User}
            label="Reports To"
            value={data.reportsTo || NA}
          /> */}

          <InfoCard
            icon={CalendarDays}
            label="Joined"
            value={data.joiningDate?.split("T")[0] || NA}
          />

          <InfoCard
            icon={Award}
            label="Experience"
            value={data.experience || NA}
          />

          <InfoCard
            icon={IdCard}
            label="Employee ID"
            value={data.employeeId || NA}
          />
          <InfoCard
            icon={IdCard}
            label="accountNumber"
            value={data.accountNumber || NA}
          />
          <InfoCard
            icon={IdCard}
            label="IfscCode"
            value={data.ifscCode || NA}
          />
          <InfoCard
            icon={IdCard}
            label="uanNumber"
            value={data.uanNumber || NA}
          />
        </div>
      </div>
    </section>
  );
}