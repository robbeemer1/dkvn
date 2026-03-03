import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, List, LayoutGrid, GripVertical, Calendar as CalendarIcon, User, Clock, Edit2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";

interface Task {
  id: string;
  event_id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  assigned_to: string | null;
  deadline: string | null;
  created_at: string;
  updated_at: string;
}

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
}

const COLUMNS = [
  { key: "todo" as const, label: "Te doen", color: "border-t-blue-400", bg: "bg-blue-50 dark:bg-blue-950/20" },
  { key: "in_progress" as const, label: "Bezig", color: "border-t-amber-400", bg: "bg-amber-50 dark:bg-amber-950/20" },
  { key: "done" as const, label: "Klaar", color: "border-t-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/20" },
];

const STATUS_BADGE: Record<Task["status"], string> = {
  todo: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  done: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
};

export default function EventTodos({ eventId }: { eventId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [newTitle, setNewTitle] = useState("");
  const [draggedTask, setDraggedTask] = useState<string | null>(null);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editForm, setEditForm] = useState({ title: "", description: "", assigned_to: "", deadline: null as Date | null, status: "todo" as Task["status"] });

  const fetchTasks = async () => {
    const { data } = await supabase
      .from("event_tasks")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at");
    setTasks((data as Task[]) || []);
  };

  const fetchOrgMembers = async () => {
    // Only fetch users who have a role (organization members), not regular members/guests
    const { data: roles } = await supabase.from("user_roles").select("user_id");
    if (!roles || roles.length === 0) { setProfiles([]); return; }
    const userIds = [...new Set(roles.map(r => r.user_id))];
    const { data } = await supabase.from("profiles").select("id, first_name, last_name").in("id", userIds).order("first_name");
    setProfiles(data || []);
  };

  useEffect(() => { fetchTasks(); fetchOrgMembers(); }, [eventId]);

  const addTask = async (status: Task["status"] = "todo") => {
    if (!newTitle.trim()) return;
    const { error } = await supabase.from("event_tasks").insert({
      event_id: eventId,
      title: newTitle.trim(),
      status,
    });
    if (error) toast.error(error.message);
    else { setNewTitle(""); fetchTasks(); }
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    await supabase.from("event_tasks").update(updates as any).eq("id", id);
    fetchTasks();
  };

  const removeTask = async (id: string) => {
    await supabase.from("event_tasks").delete().eq("id", id);
    fetchTasks();
  };

  const openEdit = (task: Task) => {
    setEditTask(task);
    setEditForm({
      title: task.title,
      description: task.description || "",
      assigned_to: task.assigned_to || "",
      deadline: task.deadline ? new Date(task.deadline) : null,
      status: task.status,
    });
  };

  const saveEdit = async () => {
    if (!editTask) return;
    await supabase.from("event_tasks").update({
      title: editForm.title,
      description: editForm.description || null,
      assigned_to: editForm.assigned_to || null,
      deadline: editForm.deadline?.toISOString() || null,
      status: editForm.status,
    } as any).eq("id", editTask.id);
    setEditTask(null);
    fetchTasks();
    toast.success("Taak bijgewerkt");
  };

  const getProfileName = (id: string | null) => {
    if (!id) return null;
    const p = profiles.find(p => p.id === id);
    return p ? `${p.first_name} ${p.last_name}` : null;
  };

  const isOverdue = (deadline: string | null) => {
    if (!deadline) return false;
    return new Date(deadline) < new Date();
  };

  // Drag handlers
  const handleDragStart = (taskId: string) => setDraggedTask(taskId);
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const handleDrop = (e: React.DragEvent, status: Task["status"]) => {
    e.preventDefault();
    if (draggedTask) { updateTask(draggedTask, { status }); setDraggedTask(null); }
  };
  const handleDragEnd = () => setDraggedTask(null);

  const TaskCard = ({ task }: { task: Task }) => {
    const assigneeName = getProfileName(task.assigned_to);
    const overdue = task.status !== "done" && isOverdue(task.deadline);

    return (
      <div
        draggable
        onDragStart={() => handleDragStart(task.id)}
        onDragEnd={handleDragEnd}
        className={cn(
          "bg-card border rounded-lg p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md group transition-all",
          draggedTask === task.id && "opacity-50"
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 min-w-0">
            <GripVertical size={14} className="text-muted-foreground/40 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-tight truncate">{task.title}</p>
              {task.description && (
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{task.description}</p>
              )}
            </div>
          </div>
          <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(task)}>
              <Edit2 size={12} />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeTask(task.id)}>
              <Trash2 size={12} className="text-destructive" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {task.deadline && (
            <span className={cn("inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5",
              overdue ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
            )}>
              <Clock size={10} />
              {format(new Date(task.deadline), "d MMM", { locale: nl })}
            </span>
          )}
          {assigneeName && (
            <span className="inline-flex items-center gap-1 text-[11px] bg-muted text-muted-foreground rounded-full px-2 py-0.5">
              <User size={10} />
              {assigneeName}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-2 flex-1 min-w-[200px]">
          <Input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Nieuwe taak..."
            onKeyDown={e => e.key === "Enter" && addTask()}
            className="max-w-sm"
          />
          <Button size="sm" onClick={() => addTask()}>
            <Plus size={14} className="mr-1" />Toevoegen
          </Button>
        </div>
        <div className="flex border rounded-md overflow-hidden">
          <Button variant={view === "kanban" ? "default" : "ghost"} size="sm" className="rounded-none" onClick={() => setView("kanban")}>
            <LayoutGrid size={14} className="mr-1" />Kanban
          </Button>
          <Button variant={view === "list" ? "default" : "ghost"} size="sm" className="rounded-none" onClick={() => setView("list")}>
            <List size={14} className="mr-1" />Lijst
          </Button>
        </div>
      </div>

      {/* Kanban View */}
      {view === "kanban" ? (
        <div className="grid grid-cols-3 gap-4">
          {COLUMNS.map(col => {
            const colTasks = tasks.filter(t => t.status === col.key);
            return (
              <div key={col.key} className={cn("rounded-lg border-t-4 min-h-[200px]", col.color, col.bg)}
                onDragOver={handleDragOver} onDrop={e => handleDrop(e, col.key)}>
                <div className="p-3 pb-2">
                  <h3 className="text-sm font-semibold flex items-center justify-between">
                    {col.label}
                    <span className="text-xs font-normal text-muted-foreground bg-background/60 rounded-full px-2 py-0.5">{colTasks.length}</span>
                  </h3>
                </div>
                <div className="p-2 pt-0 space-y-2">
                  {colTasks.map(task => <TaskCard key={task.id} task={task} />)}
                  {colTasks.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-8">Sleep taken hierheen</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List View */
        <div className="border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_140px_140px_120px_40px] gap-2 px-4 py-2 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
            <span>Taak</span>
            <span>Toegewezen aan</span>
            <span>Deadline</span>
            <span>Status</span>
            <span></span>
          </div>
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Nog geen taken</p>
          ) : (
            <div className="divide-y">
              {tasks.map(task => {
                const assigneeName = getProfileName(task.assigned_to);
                const overdue = task.status !== "done" && isOverdue(task.deadline);
                return (
                  <div key={task.id} className="grid grid-cols-[1fr_140px_140px_120px_40px] gap-2 px-4 py-3 items-center group hover:bg-muted/20 cursor-pointer"
                    onClick={() => openEdit(task)}>
                    <div className="min-w-0">
                      <p className={cn("text-sm font-medium truncate", task.status === "done" && "line-through text-muted-foreground")}>{task.title}</p>
                      {task.description && <p className="text-xs text-muted-foreground truncate">{task.description}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground truncate">{assigneeName || "—"}</span>
                    <span className={cn("text-xs", overdue ? "text-destructive font-medium" : "text-muted-foreground")}>
                      {task.deadline ? format(new Date(task.deadline), "d MMM yyyy", { locale: nl }) : "—"}
                    </span>
                    <Badge variant="secondary" className={cn("text-[11px] w-fit", STATUS_BADGE[task.status])}>
                      {COLUMNS.find(c => c.key === task.status)?.label}
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100"
                      onClick={e => { e.stopPropagation(); removeTask(task.id); }}>
                      <Trash2 size={13} className="text-destructive" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editTask} onOpenChange={open => !open && setEditTask(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Taak bewerken</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Titel</label>
              <Input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label className="text-sm font-medium">Omschrijving</label>
              <Textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Voeg details toe..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Status</label>
                <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v as Task["status"] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COLUMNS.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Toegewezen aan</label>
                <Select value={editForm.assigned_to || "__none"} onValueChange={v => setEditForm(f => ({ ...f, assigned_to: v === "__none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="Niemand" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Niemand</SelectItem>
                    {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.first_name} {p.last_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Deadline</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editForm.deadline && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {editForm.deadline ? format(editForm.deadline, "PPP", { locale: nl }) : "Kies een datum"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={editForm.deadline || undefined}
                    onSelect={d => setEditForm(f => ({ ...f, deadline: d || null }))}
                    className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
              {editForm.deadline && (
                <Button variant="link" size="sm" className="text-xs px-0 mt-1" onClick={() => setEditForm(f => ({ ...f, deadline: null }))}>
                  Deadline verwijderen
                </Button>
              )}
            </div>
            {editTask && (
              <p className="text-xs text-muted-foreground">
                Aangemaakt: {format(new Date(editTask.created_at), "d MMM yyyy HH:mm", { locale: nl })}
                {editTask.updated_at !== editTask.created_at && ` • Bijgewerkt: ${format(new Date(editTask.updated_at), "d MMM yyyy HH:mm", { locale: nl })}`}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTask(null)}>Annuleren</Button>
            <Button onClick={saveEdit}>Opslaan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
