import { PublicLanding } from "@/components/shared/lazy-home";
import { getLandingLibraryItems } from "@/lib/landing-highlights";
import {
  getCustomerServiceDetails,
  getLandingUserCountOffset,
  getPlatformConfig,
  getPlatformSocialLinks,
} from "@/models/PlatformConfig";
import User from "@/models/User";

/** The signed-out home (app/page.tsx). */
export default async function PublicHome() {
  const config = await getPlatformConfig();
  const socialLinks = getPlatformSocialLinks(config);
  const [realUserCount, libraryItems] = await Promise.all([
    User.countDocuments({ role: { $in: ["STUDENT", "TEACHER"] } }),
    // Real published courses/chapters for the library section, so the landing
    // page links into the actual catalogue instead of showing sample cards.
    getLandingLibraryItems(4),
  ]);
  const landingDisplayUserCount = realUserCount + getLandingUserCountOffset(config);

  return (
    <PublicLanding
      trialDays={config.trialDays}
      customerService={getCustomerServiceDetails(config)}
      socialLinks={socialLinks}
      landingDisplayUserCount={landingDisplayUserCount}
      libraryItems={libraryItems}
    />
  );
}
