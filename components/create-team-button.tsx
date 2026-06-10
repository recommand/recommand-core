import { useState } from "react";
import { Button } from "@core/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@core/components/ui/dialog";
import { Input } from "@core/components/ui/input";
import { toast } from "@core/components/ui/sonner";
import { useUserStore } from "@core/lib/user-store";
import { rc } from "@recommand/lib/client";
import { stringifyActionFailure } from "@recommand/lib/utils";
import type { Auth } from "@core/api/auth";
import { Plus } from "lucide-react";
import { useTranslation } from "@core/hooks/use-translation";

const client = rc<Auth>("core");

export function CreateTeamButton() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const fetchTeams = useUserStore(x => x.fetchTeams);
  const setActiveTeam = useUserStore(x => x.setActiveTeam);
  const { t } = useTranslation();

  const handleCreateTeam = async () => {
    if (!teamName.trim()) {
      toast.error(t`Please enter a team name`);
      return;
    }

    setIsCreating(true);
    try {
      const response = await client.auth.teams.$post({
        json: {
          name: teamName,
        },
      });
      const json = await response.json();

      if (json.success) {
        const newTeam = {
          ...json.data,
          createdAt: new Date(json.data.createdAt),
          updatedAt: new Date(json.data.updatedAt || json.data.createdAt),
        };
        await fetchTeams();
        setActiveTeam(newTeam);
        setIsDialogOpen(false);
        setTeamName("");
        toast.success(t`Team created successfully`);
      } else {
        throw new Error(stringifyActionFailure(json.errors));
      }
    } catch (error) {
      console.error("Error creating team:", error);
      toast.error(t`Failed to create team`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <Button onClick={() => setIsDialogOpen(true)} className="gap-2">
        <Plus className="w-4 h-4" />
        {t`Create Team`}
      </Button>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t`Create a new team`}</DialogTitle>
            <DialogDescription>
              {t`Add a new team to get started.`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Input
                id="name"
                placeholder={t`Team name`}
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateTeam();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              {t`Cancel`}
            </Button>
            <Button onClick={handleCreateTeam} disabled={isCreating || !teamName.trim()}>
              {isCreating ? t`Creating...` : t`Create team`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
