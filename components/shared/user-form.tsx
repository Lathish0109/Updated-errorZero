"use client";

import { useActionState, useState } from "react";

import Link from "next/link";
import { UserRound } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const ROLE_LABELS = {
  admin: "Admin",
  manager: "Manager",
  developer: "Developer",
  tester: "Tester",
  viewer: "Viewer",
} as const;

type UserFormValues = {
  name?: string;
  email?: string;
  role?: keyof typeof ROLE_LABELS;
  status?: "active" | "inactive";
  projects?: string[] | "all";
};

type FormState = { error?: string } | undefined;

export function UserForm({
  mode,
  defaultValues,
  projects,
  action,
}: {
  mode: "create" | "edit";
  defaultValues?: UserFormValues;
  projects: { id: string; name: string }[];
  action: (prevState: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [role, setRole] = useState<string>(defaultValues?.role ?? "developer");

  const allProjects = defaultValues?.projects === "all" || defaultValues === undefined;
  const selectedProjects = Array.isArray(defaultValues?.projects) ? defaultValues.projects : [];

  return (
    <form action={formAction} className="border-border bg-card space-y-6 rounded-lg border p-6">
      <div className="space-y-1.5">
        <Label>Profile Photo</Label>
        <div className="flex items-center gap-4">
          <Avatar className="size-14">
            <AvatarFallback>
              {defaultValues?.name ? defaultValues.name[0] : <UserRound className="size-6" />}
            </AvatarFallback>
          </Avatar>
          <div>
            <Button type="button" variant="outline" size="sm" render={<label htmlFor="photo" />}>
              Upload Photo
            </Button>
            <input id="photo" name="photo" type="file" accept="image/*" className="hidden" />
            <p className="text-muted-foreground mt-1 text-xs">
              Photo upload lands once this user has signed in and can manage their own profile.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="name">Full Name *</Label>
          <Input
            id="name"
            name="name"
            placeholder="e.g., Jane Smith"
            defaultValue={defaultValues?.name}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Work Email *</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="jane.smith@errorzero.app"
            defaultValue={defaultValues?.email}
            required
            disabled={mode === "edit"}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="password">{mode === "create" ? "Password *" : "New Password"}</Label>
          <Input
            id="password"
            name="password"
            type="password"
            placeholder={mode === "edit" ? "Leave blank to keep current password" : undefined}
            required={mode === "create"}
            minLength={6}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="role">Role *</Label>
          <Select
            value={role}
            onValueChange={(v) => setRole((v as string) ?? "developer")}
            items={ROLE_LABELS}
          >
            <SelectTrigger id="role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" name="role" value={role} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Projects</Label>
        <div className="border-border space-y-2 rounded-lg border p-3">
          <div className="flex items-center gap-2">
            <Checkbox id="project-all" name="projects" value="all" defaultChecked={allProjects} />
            <Label htmlFor="project-all" className="font-normal">
              All Projects
            </Label>
          </div>
          {projects.length > 0 ? (
            <div className="border-border ml-1 space-y-2 border-l pl-4">
              {projects.map((project) => (
                <div key={project.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`project-${project.id}`}
                    name="projects"
                    value={project.id}
                    defaultChecked={selectedProjects.includes(project.id)}
                  />
                  <Label
                    htmlFor={`project-${project.id}`}
                    className="text-muted-foreground font-normal"
                  >
                    {project.name}
                  </Label>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground ml-1 pl-4 text-xs">No projects created yet.</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <Switch
          id="status"
          name="status"
          defaultChecked={(defaultValues?.status ?? "active") === "active"}
        />
        <Label htmlFor="status" className="font-normal">
          Active
        </Label>
        <span className="text-muted-foreground text-xs">
          Inactive users cannot log in or be assigned new bugs.
        </span>
      </div>

      {state?.error ? (
        <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" render={<Link href="/users" />}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : mode === "create" ? "Create User" : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
