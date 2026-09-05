import NewExperienceClient from "./NewExperienceClient";

export const metadata = {
  title: "הגישי חוויה חדשה",
  description:
    "הגישי סדנה, סיור אוכל, או שיעור תזונה קהילתי למהמקור. החוויה תעבור אישור צוות לפני פרסום.",
  alternates: { canonical: "/experiences/new" },
};

export default function NewExperiencePage() {
  return <NewExperienceClient />;
}
