import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadEnv } from "../src/lib/env.js";
import { findRestaurant } from "../src/lib/findRestaurant.js";
import { applyWorkflowMetadata } from "../src/lib/workflow.js";
import {
  RestaurantProfile,
  SocialProfileVerificationStatus
} from "../src/types/restaurant.js";

const ROOT = process.cwd();
loadEnv();

type SocialArgs = {
  identifier: string;
  facebook?: string;
  instagram?: string;
  tiktok?: string;
  website?: string;
  noFacebook: boolean;
  noInstagram: boolean;
  noTiktok: boolean;
  notes?: string;
};

function parseArgs(argv: string[]): SocialArgs {
  const args = [...argv];
  const identifier = args.shift()?.trim();

  if (!identifier) {
    throw new Error(
      'Provide a restaurant name, slug, or Google Place ID. Example: npm run add:social -- "Big Wok II" --facebook "https://facebook.com/example"'
    );
  }

  const parsed: SocialArgs = {
    identifier,
    noFacebook: false,
    noInstagram: false,
    noTiktok: false
  };
  const supportedFlags = new Set([
    "--facebook",
    "--instagram",
    "--tiktok",
    "--website",
    "--no-facebook",
    "--no-instagram",
    "--no-tiktok",
    "--notes"
  ]);

  while (args.length > 0) {
    const flag = args.shift();

    if (!flag || !supportedFlags.has(flag)) {
      throw new Error(`Unsupported argument "${flag ?? ""}".`);
    }

    if (flag === "--no-facebook") {
      parsed.noFacebook = true;
      continue;
    }

    if (flag === "--no-instagram") {
      parsed.noInstagram = true;
      continue;
    }

    if (flag === "--no-tiktok") {
      parsed.noTiktok = true;
      continue;
    }

    const value = args.shift()?.trim();

    if (!value) {
      throw new Error(`Missing value for ${flag}.`);
    }

    if (flag === "--facebook") {
      parsed.facebook = value;
    } else if (flag === "--instagram") {
      parsed.instagram = value;
    } else if (flag === "--tiktok") {
      parsed.tiktok = value;
    } else if (flag === "--website") {
      parsed.website = value;
    } else if (flag === "--notes") {
      parsed.notes = value;
    }
  }

  return parsed;
}

function validateFlagConflicts(parsedArgs: SocialArgs): void {
  if (parsedArgs.facebook && parsedArgs.noFacebook) {
    throw new Error("Use either --facebook or --no-facebook, not both.");
  }

  if (parsedArgs.instagram && parsedArgs.noInstagram) {
    throw new Error("Use either --instagram or --no-instagram, not both.");
  }

  if (parsedArgs.tiktok && parsedArgs.noTiktok) {
    throw new Error("Use either --tiktok or --no-tiktok, not both.");
  }
}

function validateUrl(value: string, kind: "facebook" | "instagram" | "tiktok" | "website"): void {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    throw new Error(`Invalid ${kind} URL: "${value}".`);
  }

  const host = parsedUrl.hostname.toLowerCase();

  if (kind === "facebook" && !host.includes("facebook.com") && !host.includes("fb.com")) {
    throw new Error(`Facebook URL must include facebook.com or fb.com. Received: "${value}".`);
  }

  if (kind === "instagram" && !host.includes("instagram.com")) {
    throw new Error(`Instagram URL must include instagram.com. Received: "${value}".`);
  }

  if (kind === "tiktok" && !host.includes("tiktok.com")) {
    throw new Error(`TikTok URL must include tiktok.com. Received: "${value}".`);
  }

  if (
    kind === "website" &&
    parsedUrl.protocol !== "http:" &&
    parsedUrl.protocol !== "https:"
  ) {
    throw new Error(`Website URL must start with http:// or https://. Received: "${value}".`);
  }
}

async function loadRestaurants(): Promise<RestaurantProfile[]> {
  const raw = await readFile(path.join(ROOT, "data", "restaurants.seed.json"), "utf8");
  return JSON.parse(raw) as RestaurantProfile[];
}

async function main(): Promise<void> {
  const parsedArgs = parseArgs(process.argv.slice(2));
  validateFlagConflicts(parsedArgs);

  if (parsedArgs.facebook) {
    validateUrl(parsedArgs.facebook, "facebook");
  }

  if (parsedArgs.instagram) {
    validateUrl(parsedArgs.instagram, "instagram");
  }

  if (parsedArgs.tiktok) {
    validateUrl(parsedArgs.tiktok, "tiktok");
  }

  if (parsedArgs.website) {
    validateUrl(parsedArgs.website, "website");
  }

  const restaurants = await loadRestaurants();
  const { restaurant } = findRestaurant(restaurants, parsedArgs.identifier);
  const now = new Date().toISOString();

  const updatedRestaurants = restaurants.map((entry) => {
    if (entry.id !== restaurant.id) {
      return entry;
    }

    const notes = parsedArgs.notes
      ? Array.from(new Set([...(entry.socialVerificationNotes ?? []), parsedArgs.notes]))
      : entry.socialVerificationNotes;
    const currentStatus = entry.socialProfileStatus ?? {
      facebook: "unknown" as SocialProfileVerificationStatus,
      instagram: "unknown" as SocialProfileVerificationStatus,
      tiktok: "unknown" as SocialProfileVerificationStatus
    };

    return applyWorkflowMetadata({
      ...entry,
      facebookUrl: parsedArgs.noFacebook
        ? undefined
        : parsedArgs.facebook ?? entry.facebookUrl,
      instagramUrl: parsedArgs.noInstagram
        ? undefined
        : parsedArgs.instagram ?? entry.instagramUrl,
      tiktokUrl: parsedArgs.noTiktok ? undefined : parsedArgs.tiktok ?? entry.tiktokUrl,
      website: parsedArgs.website ?? entry.website,
      socialVerificationNotes: notes,
      socialLinksVerifiedAt: now,
      socialProfileStatus: {
        facebook: parsedArgs.facebook
          ? "verified"
          : parsedArgs.noFacebook
            ? "not_found"
            : currentStatus.facebook,
        instagram: parsedArgs.instagram
          ? "verified"
          : parsedArgs.noInstagram
            ? "not_found"
            : currentStatus.instagram,
        tiktok: parsedArgs.tiktok
          ? "verified"
          : parsedArgs.noTiktok
            ? "not_found"
            : currentStatus.tiktok
      },
      lastSocialReviewedAt: now,
      updatedAt: now
    });
  });

  await writeFile(
    path.join(ROOT, "data", "restaurants.seed.json"),
    JSON.stringify(updatedRestaurants, null, 2),
    "utf8"
  );

  console.log(`Updated social links for: ${restaurant.name}`);
  console.log(
    `Facebook: ${
      parsedArgs.noFacebook
        ? "marked not_found"
        : parsedArgs.facebook ?? restaurant.facebookUrl ?? "unchanged"
    }`
  );
  console.log(
    `Instagram: ${
      parsedArgs.noInstagram
        ? "marked not_found"
        : parsedArgs.instagram ?? restaurant.instagramUrl ?? "unchanged"
    }`
  );
  console.log(
    `TikTok: ${
      parsedArgs.noTiktok
        ? "marked not_found"
        : parsedArgs.tiktok ?? restaurant.tiktokUrl ?? "unchanged"
    }`
  );
  console.log(`Website: ${parsedArgs.website ?? restaurant.website ?? "unchanged"}`);
  console.log(`Notes: ${parsedArgs.notes ?? "none added"}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`add:social failed: ${message}`);
  process.exit(1);
});
