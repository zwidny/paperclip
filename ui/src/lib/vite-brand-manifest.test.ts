import { describe, expect, it } from "vitest";
import { brandManifestFields } from "./vite-brand-manifest";

describe("brand manifest fields", () => {
  it("renames the install label in a white-label build", () => {
    const manifest = {
      id: "/",
      name: "Paperclip",
      short_name: "Paperclip",
      description: "AI-powered project management and agent coordination platform",
      start_url: "/",
    };

    const branded = brandManifestFields(manifest, "Gnzs");

    expect(branded.name).toBe("Gnzs");
    expect(branded.short_name).toBe("Gnzs");
    // Everything that identifies the app stays.
    expect(branded.id).toBe("/");
    expect(branded.start_url).toBe("/");
    expect(branded.description).toBe(manifest.description);
  });

  it("leaves values that do not name the product alone", () => {
    const manifest = { name: "Acme Console", short_name: "Acme", id: "/" };
    expect(brandManifestFields(manifest, "Gnzs")).toEqual(manifest);
  });

  it("does not mutate the input manifest", () => {
    const manifest = { name: "Paperclip" };
    brandManifestFields(manifest, "Gnzs");
    expect(manifest.name).toBe("Paperclip");
  });

  it("keeps lowercase identifiers intact when they appear in a label", () => {
    const branded = brandManifestFields({ name: "paperclip.ing dashboard" }, "Gnzs");
    expect(branded.name).toBe("paperclip.ing dashboard");
  });
});
