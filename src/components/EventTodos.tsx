import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, List, LayoutGrid, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Task {
  id: string;
  event_id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  assigned_to: string | null;
  deadline: string | null;
}

const COLUMNS = [
  { key: "todo" as const, label: "Te doen", color: "border-t-blue-400" },
  { key: "in_progress" as const, label: "Bezig", color: "border-t-amber-400" },
  { key: "done" as const, label: "Klaar", color: "border-t-emerald-400" },
];

export default function EventTodos({ eventId }: { eventId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [newTitle, setNewTitle] = useState("");
  const [draggedTask, setDraggedTask] = useState<string | null>(null);

  const fetchTasks = async () => {
    const { data } = await supabase
      .from("event_tasks")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at");
    setTasks((data as Task[]) || []);
  };

  useEffect(() => { fetchTasks(); }, [eventId]);

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

  // Drag handlers for Kanban
  const handleDragStart = (taskId: string) => {
    setDraggedTask(taskId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, status: Task["status"]) => {
    e.preventDefault();
    if (draggedTask) {
      updateTask(draggedTask, { status });
      setDraggedTask(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2 flex-1 mr-4">
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
          <Button
            variant={view === "kanban" ? "default" : "ghost"}
            size="sm"
            className="rounded-none"
            onClick={() => setView("kanban")}
          >
            <LayoutGrid size={14} className="mr-1" />Kanban
          </Button>
          <Button
            variant={view === "list" ? "default" : "ghost"}
            size="sm"
            className="rounded-none"
            onClick={() => setView("list")}
          >
            <List size={14} className="mr-1" />Lijst
          </Button>
        </div>
      </div>

      {view === "kanban" ? (
        <div className="grid grid-cols-3 gap-4">
          {COLUMNS.map(col => {
            const colTasks = tasks.filter(t => t.status === col.key);
            return (
              <div
                key={col.key}
                className={cn("rounded-lg border-t-4 bg-muted/30 min-h-[200px]", col.color)}
                onDragOver={handleDragOver}
                onDrop={e => handleDrop(e, col.key)}
              >
                <div className="p-3 pb-2">
                  <h3 className="text-sm font-semibold flex items-center justify-between">
                    {col.label}
                    <span className="text-xs font-normal text-muted-foreground bg-muted rounded-full px-2 py-0.5">{colTasks.length}</span>
                  </h3>
                </div>
                <div className="p-2 pt-0 space-y-2">
                  {colTasks.map(task => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() => handleDragStart(task.id)}
                      onDragEnd={handleDragEnd}
                      className={cn(
                        "bg-card border rounded-md p-3 cursor-grab active:cursor-grabbing shadow-sm hover:shadow group transition-shadow",
                        draggedTask === task.id && "opacity-50"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1">
                          <GripVertical size={14} className="text-muted-foreground/40 mt-0.5 shrink-0" />
                          <span className="text-sm">{task.title}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                          onClick={() => removeTask(task.id)}
                        >
                          <Trash2 size={12} className="text-destructive" />
                        </Button>
                      </div>
                      {task.deadline && (
                        <p className="text-xs text-muted-foreground mt-1 ml-6">
                          {new Date(task.deadline).toLocaleDateString("nl-NL")}
                        </p>
                      )}
                    </div>
                  ))}
                  {colTasks.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-6">Sleep taken hierheen</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* List view */
        <Card>
          <CardContent className="p-0">
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nog geen taken</p>
            ) : (
              <div className="divide-y">
                {tasks.map(task => (
                  <div key={task.id} className="flex items-center gap-3 px-4 py-3 group">
                    <input
                      type="checkbox"
                      checked={task.status === "done"}
                      onChange={() => updateTask(task.id, { status: task.status === "done" ? "todo" : "done" })}
                      className="rounded border-border"
                    />
                    <span className={cn("flex-1 text-sm", task.status === "done" && "line-through text-muted-foreground")}>{task.title}</span>
                    <select
                      value={task.status}
                      onChange={e => updateTask(task.id, { status: e.target.value as Task["status"] })}
                      className="text-xs border rounded px-2 py-1 bg-background"
                    >
                      {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                    <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => removeTask(task.id)}>
                      <Trash2 size={13} className="text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
