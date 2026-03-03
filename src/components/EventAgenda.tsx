import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, GripVertical, Clock } from "lucide-react";
import { toast } from "sonner";

interface AgendaItem {
  id: string;
  event_id: string;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  sort_order: number;
}

export default function EventAgenda({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<AgendaItem[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");

  const fetchItems = async () => {
    const { data } = await supabase
      .from("event_agenda_items")
      .select("*")
      .eq("event_id", eventId)
      .order("sort_order")
      .order("start_time");
    setItems((data as AgendaItem[]) || []);
  };

  useEffect(() => { fetchItems(); }, [eventId]);

  const addItem = async () => {
    if (!newTitle.trim()) return;
    const { error } = await supabase.from("event_agenda_items").insert({
      event_id: eventId,
      title: newTitle.trim(),
      start_time: newStart || null,
      end_time: newEnd || null,
      sort_order: items.length,
    } as any);
    if (error) toast.error(error.message);
    else {
      setNewTitle("");
      setNewStart("");
      setNewEnd("");
      fetchItems();
    }
  };

  const removeItem = async (id: string) => {
    await supabase.from("event_agenda_items").delete().eq("id", id);
    fetchItems();
  };

  const updateItem = async (id: string, updates: Partial<AgendaItem>) => {
    await supabase.from("event_agenda_items").update(updates as any).eq("id", id);
    fetchItems();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Onderdeel</label>
              <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Bijv. Ontvangst met koffie" onKeyDown={e => e.key === "Enter" && addItem()} />
            </div>
            <div className="w-[100px] space-y-1">
              <label className="text-xs text-muted-foreground">Start</label>
              <Input type="time" value={newStart} onChange={e => setNewStart(e.target.value)} />
            </div>
            <div className="w-[100px] space-y-1">
              <label className="text-xs text-muted-foreground">Eind</label>
              <Input type="time" value={newEnd} onChange={e => setNewEnd(e.target.value)} />
            </div>
            <Button size="sm" onClick={addItem}><Plus size={14} className="mr-1" />Toevoegen</Button>
          </div>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nog geen agenda-items. Voeg onderdelen toe aan de agenda.</CardContent></Card>
      ) : (
        <div className="space-y-1">
          {items.map((item, idx) => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3 rounded-lg border bg-card hover:bg-muted/30 group">
              <GripVertical size={14} className="text-muted-foreground/40" />
              <div className="flex items-center gap-2 w-[140px] shrink-0 text-sm text-muted-foreground">
                <Clock size={12} />
                {item.start_time ? (
                  <span>{item.start_time.slice(0, 5)}{item.end_time ? ` – ${item.end_time.slice(0, 5)}` : ""}</span>
                ) : (
                  <span className="italic">Geen tijd</span>
                )}
              </div>
              <Input
                className="flex-1 border-0 bg-transparent px-0 h-auto text-sm font-medium focus-visible:ring-0"
                value={item.title}
                onChange={e => {
                  setItems(prev => prev.map(i => i.id === item.id ? { ...i, title: e.target.value } : i));
                }}
                onBlur={e => updateItem(item.id, { title: e.target.value })}
              />
              <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100" onClick={() => removeItem(item.id)}>
                <Trash2 size={13} className="text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
