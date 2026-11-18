import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Check, MoreVertical, Pencil, Trash2, Compass, Building2, FolderKanban, ListChecks, KanbanSquare, GanttChartSquare, CalendarDays, BarChart3, LayoutDashboard, Users, Target, TrendingUp, } from 'lucide-react';

import { useAuth } from '../../contexts/AuthContext';

import { canAccessModule, canAccessEdit, } from '../../constants/modules';
import Breadcrumb from '../../components/UI/Breadcrumb';
import Overview from './Overview';
import Department from '../../pages/Admin/AdminDepartments';
import Projects from './Projects';
import Tasks from './Tasks';


import ListView from './views/ListView';
import BoardView from './views/BoardView';
import TimelineView from './views/TimelineView';
import CalendarView from './views/CalendarView';
import GanttView from './views/GanttView';
import OverviewView from './views/OverviewView';
import DashboardView from './views/DashboardView';
import WorkloadView from './views/WorkloadView';
import GoalsView from './views/GoalsView';
import PerformanceView from './views/PerformanceView';
/* ------------------------------------------------------------------ */
/*  Existing protected Workspace tabs (unchanged, just icons added)   */
/* ------------------------------------------------------------------ */
const NAV_ITEMS = [
  { key: 'overview', label: 'Overview', icon: Compass },
  { key: 'department', label: 'Department', icon: Building2 },
  { key: 'project', label: 'Projects', icon: FolderKanban },
  { key: 'task', label: 'Tasks', icon: ListChecks },
];
/* ------------------------------------------------------------------ */
/*  Central config for every view that can be added via the "+" card  */
/* ------------------------------------------------------------------ */
const WORKSPACE_VIEWS = [
  { key: 'list', label: 'List', description: 'View work as a structured list', icon: ListChecks },
  { key: 'board', label: 'Board', description: 'Organize work in visual columns', icon: KanbanSquare },
  { key: 'timeline', label: 'Timeline', description: 'See work across a timeline', icon: GanttChartSquare },
  { key: 'calendar', label: 'Calendar', description: 'View work by date', icon: CalendarDays },
  { key: 'gantt', label: 'Gantt', description: 'Plan work using timeline bars', icon: BarChart3 },
  { key: 'overview', label: 'Overview', description: 'Get a high-level view of the workspace', icon: Compass },
  { key: 'dashboard', label: 'Dashboard', description: 'Monitor workspace metrics', icon: LayoutDashboard },
  { key: 'workload', label: 'Workload', description: 'See team workload and capacity', icon: Users },
  { key: 'goals', label: 'Goals', description: 'Track workspace goals', icon: Target },
  { key: 'performance', label: 'Performance / KPIs', description: 'Monitor performance and KPIs', icon: TrendingUp },
];

const VIEW_COMPONENTS = {
  list: ListView,
  board: BoardView,
  timeline: TimelineView,
  calendar: CalendarView,
  gantt: GanttView,
  overview: OverviewView,
  dashboard: DashboardView,
  workload: WorkloadView,
  goals: GoalsView,
  performance: PerformanceView,
};

const getViewConfig = (viewKey) => WORKSPACE_VIEWS.find((view) => view.key === viewKey);

/* ------------------------------------------------------------------ */
/*  WorkspaceNavItem — single nav tab (editable label, rename/remove) */
/* ------------------------------------------------------------------ */

const WorkspaceNavItem = ({ label, icon: Icon, isActive, editable = false, onSelect, onRename, onRemove, startEditing = false, onEditingHandled,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(label);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef(null);
  const menuButtonRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, });

  useEffect(() => { setDraftLabel(label); }, [label]);

  useEffect(() => {
    if (startEditing) { setIsEditing(true); onEditingHandled?.(); }
  }, [startEditing, onEditingHandled]);

  useEffect(() => {
    if (isEditing) { inputRef.current?.focus(); inputRef.current?.select(); }
  }, [isEditing]);

  const updateMenuPosition = () => {
    if (!menuButtonRef.current) return;
    const rect = menuButtonRef.current.getBoundingClientRect();
    setMenuPosition({ top: rect.bottom + 6, left: rect.right - 144, });
  };

  useEffect(() => {
    if (!menuOpen) return;
    updateMenuPosition();
    const handleOutsideClick = (event) => {
      if (menuButtonRef.current && !menuButtonRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') { setMenuOpen(false); }
    };
    const handlePositionUpdate = () => {
      updateMenuPosition();
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handlePositionUpdate);
    window.addEventListener('scroll', handlePositionUpdate, true);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handlePositionUpdate);
      window.removeEventListener('scroll', handlePositionUpdate, true);
    };
  }, [menuOpen]);
  const commitRename = () => {
    const trimmed = draftLabel.trim();
    if (trimmed && trimmed !== label) {
      onRename?.(trimmed);
    } else { setDraftLabel(label); }
    setIsEditing(false);
  };
  const cancelRename = () => {
    setDraftLabel(label);
    setIsEditing(false);
  };
  if (isEditing) {
    return (
      <input
        ref={inputRef}
        value={draftLabel}
        onChange={(event) => setDraftLabel(event.target.value)}
        onBlur={commitRename}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitRename();
          }
          if (event.key === 'Escape') { event.preventDefault(); cancelRename(); }
        }}
        className="w-36 rounded-xl border border-violet-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-900 outline-none ring-2 ring-violet-100"
      />
    );
  }

  return (
    <div className="group relative flex items-center">
      {/* TAB */}
      <button type="button" onClick={onSelect}
        className={` relative flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-200 ${isActive ? 'bg-violet-50 text-violet-700' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'} ${editable ? 'pr-8' : ''} `}
      >
        {Icon && (
          <Icon className={`h-4 w-4 shrink-0 transition-colors ${isActive ? 'text-violet-600' : 'text-gray-300 group-hover:text-gray-500'}`} strokeWidth={2} />
        )}

        <span>{label}</span>

        {isActive && (
          <motion.div
            layoutId="workspace-active-view"
            className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-violet-600"
            transition={{
              type: 'spring',
              stiffness: 500,
              damping: 40,
            }}
          />
        )}
      </button>

      {/* OPTIONS BUTTON */}
      {editable && (
        <button
          ref={menuButtonRef}
          type="button"
          onClick={(event) => {
            event.stopPropagation();

            setMenuOpen((prev) => {
              const next = !prev;

              if (next) {
                requestAnimationFrame(updateMenuPosition);
              }

              return next;
            });
          }}
          className={`
            absolute right-1.5 top-1/2
            flex h-5 w-5
            -translate-y-1/2
            items-center justify-center
            rounded-md
            text-gray-400
            opacity-0
            transition-all
            hover:bg-gray-100
            hover:text-gray-600
            group-hover:opacity-100
            ${menuOpen
              ? 'bg-gray-100 opacity-100'
              : ''
            }
          `}
          aria-label="View options"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      )}

      {/* PORTAL MENU */}
      {editable &&
        menuOpen &&
        createPortal(
          <AnimatePresence>
            <motion.div
              initial={{
                opacity: 0,
                scale: 0.96,
                y: -4,
              }}
              animate={{
                opacity: 1,
                scale: 1,
                y: 0,
              }}
              exit={{
                opacity: 0,
                scale: 0.96,
                y: -4,
              }}
              transition={{
                duration: 0.12,
              }}
              style={{
                position: 'fixed',
                top: menuPosition.top,
                left: menuPosition.left,
                zIndex: 9999,
              }}
              className="w-36 overflow-hidden rounded-xl border border-gray-100 bg-white p-1 shadow-xl"
            >
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setIsEditing(true);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50"
              >
                <Pencil className="h-3.5 w-3.5" />
                Rename
              </button>

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onRemove?.();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-red-500 transition-colors hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove
              </button>
            </motion.div>
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  WorkspaceViewPicker — animated "+" popover with search            */
/* ------------------------------------------------------------------ */
const WorkspaceViewPicker = ({
  isOpen,
  onClose,
  addedKeys,
  onAddView,
  anchorRef,
}) => {
  const [query, setQuery] = useState('');

  const [position, setPosition] = useState({
    top: 0,
    left: 0,
  });

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      return;
    }

    const updatePosition = () => {
      if (!anchorRef?.current) return;

      const rect = anchorRef.current.getBoundingClientRect();

      const cardWidth = 340;
      const margin = 8;

      let left = rect.right - cardWidth;

      // Prevent card from going outside viewport
      left = Math.max(
        margin,
        Math.min(
          left,
          window.innerWidth - cardWidth - margin
        )
      );

      setPosition({
        top: rect.bottom + 8,
        left,
      });
    };

    updatePosition();

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    const handleOutsideClick = (event) => {
      if (
        anchorRef?.current &&
        !anchorRef.current.contains(event.target)
      ) {
        const picker = document.getElementById(
          'workspace-view-picker'
        );

        if (
          picker &&
          !picker.contains(event.target)
        ) {
          onClose();
        }
      }
    };

    window.addEventListener(
      'resize',
      updatePosition
    );

    window.addEventListener(
      'scroll',
      updatePosition,
      true
    );

    document.addEventListener(
      'keydown',
      handleEscape
    );

    document.addEventListener(
      'mousedown',
      handleOutsideClick
    );

    return () => {
      window.removeEventListener(
        'resize',
        updatePosition
      );

      window.removeEventListener(
        'scroll',
        updatePosition,
        true
      );

      document.removeEventListener(
        'keydown',
        handleEscape
      );

      document.removeEventListener(
        'mousedown',
        handleOutsideClick
      );
    };
  }, [isOpen, onClose, anchorRef]);

  const filteredViews = useMemo(() => {
    const q = query.trim().toLowerCase();

    if (!q) {
      return WORKSPACE_VIEWS;
    }

    return WORKSPACE_VIEWS.filter(
      (view) =>
        view.label
          .toLowerCase()
          .includes(q) ||
        view.description
          .toLowerCase()
          .includes(q)
    );
  }, [query]);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        id="workspace-view-picker"
        initial={{
          opacity: 0,
          scale: 0.96,
          y: -6,
        }}
        animate={{
          opacity: 1,
          scale: 1,
          y: 0,
        }}
        exit={{
          opacity: 0,
          scale: 0.96,
          y: -6,
        }}
        transition={{
          duration: 0.16,
          ease: 'easeOut',
        }}
        style={{
          position: 'fixed',
          top: position.top,
          left: position.left,
          zIndex: 9999,
        }}
        className="
          w-[340px]
          max-w-[calc(100vw-1rem)]
          overflow-hidden
          rounded-2xl
          border border-gray-100
          bg-white
          shadow-2xl
        "
      >
        {/* HEADER */}
        <div className="border-b border-gray-50 p-4">
          <p className="text-sm font-semibold text-gray-900">
            Add view
          </p>

          <p className="mt-0.5 text-xs text-gray-400">
            Choose how you want to view your work
          </p>

          {/* SEARCH */}
          <div className="relative mt-3">
            <Search
              className="
                pointer-events-none
                absolute
                left-2.5
                top-1/2
                h-3.5
                w-3.5
                -translate-y-1/2
                text-gray-300
              "
            />

            <input
              autoFocus
              value={query}
              onChange={(event) =>
                setQuery(event.target.value)
              }
              placeholder="Search views..."
              className="
                w-full
                rounded-lg
                border
                border-gray-100
                bg-gray-50
                py-2
                pl-8
                pr-3
                text-xs
                font-medium
                text-gray-700
                outline-none
                placeholder:text-gray-400
                focus:border-violet-200
                focus:bg-white
                focus:ring-2
                focus:ring-violet-100
              "
            />
          </div>
        </div>

        {/* VIEW LIST */}
        <div className="max-h-80 overflow-y-auto p-2">
          {filteredViews.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-gray-400">
              No views found
            </p>
          ) : (
            filteredViews.map((view) => {
              const Icon = view.icon;
              const isAdded = addedKeys.has(
                view.key
              );

              return (
                <button
                  key={view.key}
                  type="button"
                  disabled={isAdded}
                  onClick={() => {
                    onAddView(view);
                    onClose();
                  }}
                  className={`
                    group
                    flex
                    w-full
                    items-center
                    gap-3
                    rounded-xl
                    px-2.5
                    py-2.5
                    text-left
                    transition-all
                    duration-150
                    ${isAdded
                      ? 'cursor-default opacity-60'
                      : 'hover:bg-violet-50/70'
                    }
                  `}
                >
                  {/* ICON */}
                  <span
                    className={`
                      flex
                      h-8
                      w-8
                      shrink-0
                      items-center
                      justify-center
                      rounded-lg
                      bg-gray-50
                      text-gray-500
                      transition-all
                      duration-150
                      ${!isAdded
                        ? 'group-hover:bg-violet-100 group-hover:text-violet-600 group-hover:scale-105'
                        : ''
                      }
                    `}
                  >
                    <Icon
                      className="h-4 w-4"
                      strokeWidth={2}
                    />
                  </span>

                  {/* TEXT */}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-gray-800">
                      {view.label}
                    </span>

                    <span className="block truncate text-xs text-gray-400">
                      {view.description}
                    </span>
                  </span>

                  {/* STATUS */}
                  {isAdded ? (
                    <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-violet-500">
                      <Check className="h-3.5 w-3.5" />
                      Added
                    </span>
                  ) : (
                    <span className="shrink-0 text-gray-300 transition-all group-hover:translate-x-1 group-hover:text-violet-400">
                      →
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};
/* ------------------------------------------------------------------ */
/*  WorkspaceNav — the horizontal nav bar container                   */
/* ------------------------------------------------------------------ */

const WorkspaceNav = ({
  items,
  activeTab,
  onSelect,
  onRename,
  onRemove,
  addedKeys,
  onAddView,
  newlyAddedKey,
  onEditingHandled,
}) => {
  const [pickerOpen, setPickerOpen] =
    useState(false);

  const addButtonRef = useRef(null);

  return (
    <div className="relative overflow-x-auto rounded-2xl border border-gray-100 bg-white p-1.5 shadow-sm">
      <div className="flex min-w-max items-center gap-1">

        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.div
              key={item.key}
              layout
              initial={{
                opacity: 0,
                scale: 0.9,
                y: -4,
              }}
              animate={{
                opacity: 1,
                scale: 1,
                y: 0,
              }}
              exit={{
                opacity: 0,
                scale: 0.9,
              }}
              transition={{
                duration: 0.18,
                ease: 'easeOut',
              }}
            >
              <WorkspaceNavItem
                label={item.label}
                icon={item.icon}
                isActive={
                  activeTab === item.key
                }
                editable={item.editable}
                onSelect={() =>
                  onSelect(item.key)
                }
                onRename={
                  item.editable
                    ? (newLabel) =>
                      onRename(
                        item.key,
                        newLabel
                      )
                    : undefined
                }
                onRemove={
                  item.editable
                    ? () =>
                      onRemove(item.key)
                    : undefined
                }
                startEditing={
                  item.editable &&
                  item.key === newlyAddedKey
                }
                onEditingHandled={
                  onEditingHandled
                }
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* PLUS BUTTON */}
        <button
          ref={addButtonRef}
          type="button"
          onClick={() =>
            setPickerOpen(
              (prev) => !prev
            )
          }
          title="Add view"
          aria-label="Add view"
          className={`
            flex
            h-9
            w-9
            shrink-0
            items-center
            justify-center
            rounded-xl
            text-gray-400
            transition-all
            duration-200
            hover:bg-violet-50
            hover:text-violet-600
            hover:scale-105
            ${pickerOpen
              ? 'bg-violet-50 text-violet-600'
              : ''
            }
          `}
        >
          <Plus
            className="h-4 w-4"
            strokeWidth={2.5}
          />
        </button>

        {/* PORTAL NAV CARD */}
        <WorkspaceViewPicker
          isOpen={pickerOpen}
          onClose={() =>
            setPickerOpen(false)
          }
          addedKeys={addedKeys}
          onAddView={onAddView}
          anchorRef={addButtonRef}
        />

      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Workspace — main page                                             */
/* ------------------------------------------------------------------ */

const Workspace = () => {
  // Get the logged-in user directly from AuthContext
  const { user, loading } = useAuth();

  // Only show Workspace tabs the user can access
  // (unchanged — Module Access logic is untouched)
  const visibleItems = NAV_ITEMS.filter((item) => canAccessModule(user, item.key));

  const [activeTab, setActiveTab] = useState(null);

  // Views added through the "+" picker. Local state only for now —
  // no backend persistence, as requested.
  // Shape: [{ key: 'board', label: 'Board' }, ...]
  const [customViews, setCustomViews] = useState([]);

  // Key of the view that was just added via the "+" card — its nav
  // item picks this up to open straight into rename mode with the
  // default label selected. Cleared as soon as that item consumes it.
  const [newlyAddedKey, setNewlyAddedKey] = useState(null);
  // Set first available tab
  useEffect(() => {
    if (loading) return;
    if (visibleItems.length === 0) {
      setActiveTab(null);
      return;
    }
    const currentTabStillAllowed =
      visibleItems.some((item) => item.key === activeTab) ||
      customViews.some((view) => view.key === activeTab);
    if (!currentTabStillAllowed) {
      setActiveTab(visibleItems[0].key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, activeTab, visibleItems]);

  // Any WORKSPACE_VIEWS key already represented in the nav — used to
  // prevent the "+" picker from adding the same view twice. A protected
  // tab (e.g. "overview") counts as already-added too.
  const addedViewKeys = useMemo(() => {
    const fromProtected = visibleItems
      .map((item) => item.key)
      .filter((key) => WORKSPACE_VIEWS.some((view) => view.key === key));
    const fromCustom = customViews.map((view) => view.key);
    return new Set([...fromProtected, ...fromCustom]);
  }, [visibleItems, customViews]);

  // Combined, ordered list of everything the nav bar renders
  const navItems = useMemo(
    () => [
      ...visibleItems.map((item) => ({ ...item, editable: false })),
      ...customViews.map((view) => ({
        key: view.key,
        label: view.label,
        icon: getViewConfig(view.key)?.icon,
        editable: true,
      })),
    ],
    [visibleItems, customViews]
  );

  const handleAddView = (view) => {
    if (addedViewKeys.has(view.key)) return;
    setCustomViews((prev) => [...prev, { key: view.key, label: view.label }]);
    setActiveTab(view.key);
    setNewlyAddedKey(view.key);
  };

  const handleRenameView = (key, newLabel) => {
    setCustomViews((prev) => prev.map((view) => (view.key === key ? { ...view, label: newLabel } : view)));
  };

  const handleRemoveView = (key) => {
    setCustomViews((prev) => prev.filter((view) => view.key !== key));
    if (activeTab === key) {
      setActiveTab(visibleItems[0]?.key ?? null);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return <Overview canEdit={canAccessEdit(user, 'overview')} />;

      case 'department':
        return <Department canEdit={canAccessEdit(user, 'department')} />;

      case 'project':
        return <Projects canEdit={canAccessEdit(user, 'project')} />;

      case 'task':
        return <Tasks canEdit={canAccessEdit(user, 'task')} />;

      default: {
        const ViewComponent = VIEW_COMPONENTS[activeTab];

        if (!ViewComponent) {
          return null;
        }

        return <ViewComponent />;
      }
    }
  };

  if (loading) {
    return null;
  }

  if (!user) {
    return null;
  }

  if (visibleItems.length === 0) {
    return (
      <div className="space-y-5">
        <Breadcrumb
          items={[
            {
              label: 'Employee Management',
              path: '/admin/employee-management',
            },
            {
              label: 'Workspace',
            },
          ]}
        />
        <div>
          <h2 className="text-xl font-extrabold text-gray-900">
            Workspace
          </h2>

          <p className="text-sm text-gray-400 mt-0.5">
            Manage projects, tasks and team work
          </p>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-8 text-center">
          <p className="text-sm text-gray-500">
            You don't have access to any Workspace modules.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Breadcrumb
        items={[
          {
            label: 'Employee Management',
            path: '/admin/employee-management',
          },
          {
            label: 'Workspace',
          },
        ]}
      />
      {/* Header */}
      <div>
        <h2 className="text-xl font-extrabold text-gray-900">
          Workspace
        </h2>

        <p className="text-sm text-gray-400 mt-0.5">
          Manage projects, tasks and team work
        </p>
      </div>

      {/* Workspace internal navigation */}
      <WorkspaceNav
        items={navItems}
        activeTab={activeTab}
        onSelect={setActiveTab}
        onRename={handleRenameView}
        onRemove={handleRemoveView}
        addedKeys={addedViewKeys}
        onAddView={handleAddView}
        newlyAddedKey={newlyAddedKey}
        onEditingHandled={() => setNewlyAddedKey(null)}
      />

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>

    </div>
  );
};

export default Workspace;