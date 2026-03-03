import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, GripVertical, Clock } from "lucide-react";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const isMobile = useIsMobile();

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
      setDialogOpen(false);
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

  const addForm = (
    <div className={isMobile ? "space-y-4" : "flex gap-2 items-end"}>
      <div className={isMobile ? "space-y-1" : "flex-1 space-y-1"}>
        <Label className="text-xs text-muted-foreground">Onderdeel</Label>
        <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Bijv. Ontvangst met koffie" onKeyDown={e => e.key === "Enter" && addItem()} />
      </div>
      <div className={isMobile ? "grid grid-cols-2 gap-2" : "contents"}>
        <div className={isMobile ? "space-y-1" : "w-[100px] space-y-1"}>
          <Label className="text-xs text-muted-foreground">Start</Label>
          <Input type="time" value={newStart} onChange={e => setNewStart(e.target.value)} />
        </div>
        <div className={isMobile ? "space-y-1" : "w-[100px] space-y-1"}>
          <Label className="text-xs text-muted-foreground">Eind</Label>
          <Input type="time" value={newEnd} onChange={e => setNewEnd(e.target.value)} />
        </div>
      </div>
      {isMobile ? (
        <Button className="w-full" onClick={addItem}><Plus size={14} className="mr-1" />Toevoegen</Button>
      ) : (
        <Button size="sm" onClick={addItem}><Plus size={14} className="mr-1" />Toevoegen</Button>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {isMobile ? (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus size={14} className="mr-1" />Agenda-item toevoegen</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle className="font-display">Agenda-item toevoegen</DialogTitle></DialogHeader>
            {addForm}
          </DialogContent>
        </Dialog>
      ) : (
        <Card>
          <CardContent className="pt-6">
            {addForm}
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">Nog geen agenda-items. Voeg onderdelen toe aan de agenda.</CardContent></Card>
      ) : (
        <div className="space-y-1">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 rounded-lg border bg-card hover:bg-muted/30 group">
              <GripVertical size={14} className="text-muted-foreground/40 hidden sm:block" />
              <div className="flex items-center gap-2 w-[100px] sm:w-[140px] shrink-0 text-xs sm:text-sm text-muted-foreground">
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
