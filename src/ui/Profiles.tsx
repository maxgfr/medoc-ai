import { type FormEvent, useState } from "react";
import { deleteProfile, putProfile } from "../db/db";
import { PROFILE_COLORS, type Profile, uid } from "../db/model";
import { useT } from "../i18n/react";
import { Avatar, Button, Field, Icon, PageTitle } from "./kit";
import { useApp } from "./state";

export function Profiles() {
  const t = useT();
  const { profiles, active, setActive, reload, items, treatments } = useApp();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Profile | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const p: Profile = {
      id: uid(),
      name: name.trim(),
      color: PROFILE_COLORS[profiles.length % PROFILE_COLORS.length] ?? "#047857",
      createdAt: new Date().toISOString(),
    };
    await putProfile(p);
    await reload();
    await setActive(p.id);
    setName("");
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing?.name.trim()) return;
    await putProfile({ ...editing, name: editing.name.trim() });
    setEditing(null);
    await reload();
  }

  async function remove(id: string) {
    await deleteProfile(id);
    setConfirm(null);
    await reload();
  }

  return (
    <div className="grid gap-4">
      <PageTitle title={t("profile.title")} subtitle={t("profile.hint")} />
      <ul className="card divide-y divide-stone-100 p-0 dark:divide-stone-800">
        {profiles.map((p) => {
          const count =
            items.filter((i) => i.profileId === p.id && !i.finishedAt).length +
            treatments.filter((x) => x.profileId === p.id).length;
          return (
            <li key={p.id} className="px-4 py-3">
              {editing?.id === p.id ? (
                <form onSubmit={saveEdit} className="grid gap-3">
                  <Field label={t("profile.name")}>
                    <input
                      className="input"
                      value={editing.name}
                      onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    />
                  </Field>
                  <fieldset className="flex flex-wrap gap-2">
                    <legend className="sr-only">{t("profile.color")}</legend>
                    {PROFILE_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={editing.color === c}
                        aria-label={c}
                        onClick={() => setEditing({ ...editing, color: c })}
                        className={`size-8 rounded-full ${editing.color === c ? "ring-2 ring-offset-2 ring-stone-900 dark:ring-white" : ""}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </fieldset>
                  <div className="flex gap-2">
                    <Button type="submit">{t("common.save")}</Button>
                    <Button variant="ghost" onClick={() => setEditing(null)}>
                      {t("common.cancel")}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void setActive(p.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    aria-pressed={active.id === p.id}
                  >
                    <Avatar name={p.name} color={p.color} size="size-9" />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.name}</span>
                      {active.id === p.id ? (
                        <span className="text-xs text-brand-700 dark:text-brand-400">
                          {t("profile.active")}
                        </span>
                      ) : (
                        <span className="text-xs text-stone-500">{count}</span>
                      )}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                    aria-label={t("common.edit")}
                    onClick={() => setEditing(p)}
                  >
                    <Icon name="edit" className="size-4" />
                  </button>
                  {profiles.length > 1 ? (
                    confirm === p.id ? (
                      <span className="flex items-center gap-1 text-xs">
                        <Button variant="danger" onClick={() => void remove(p.id)}>
                          {t("common.yes")}
                        </Button>
                        <Button variant="ghost" onClick={() => setConfirm(null)}>
                          {t("common.no")}
                        </Button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950"
                        aria-label={t("common.delete")}
                        title={t("profile.deleteWarn")}
                        onClick={() => setConfirm(p.id)}
                      >
                        <Icon name="trash" className="size-4" />
                      </button>
                    )
                  ) : null}
                </div>
              )}
              {confirm === p.id ? (
                <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">
                  {t("profile.deleteWarn")}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <form onSubmit={add} className="card flex items-end gap-2">
        <div className="flex-1">
          <Field label={t("profile.add")}>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("profile.name")}
            />
          </Field>
        </div>
        <Button type="submit" icon="plus" disabled={!name.trim()}>
          {t("common.add")}
        </Button>
      </form>
    </div>
  );
}
