/**
 * MEH-2447 — «איסוף או ביקור בתיאום מראש» as the owner's own answer.
 *
 * DISCRIMINATION: before MEH-2447 fulfillmentTags ignored `byArrangement`
 * (a store that delivers showed «משלוח בלבד», never «בתיאום מראש»), the card
 * never read `by_arrangement`, and the wizard had no "arranged" axis, so each
 * case below fails against the old code.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import MapProducerCard from "@/components/MapProducerCard";
import { fulfillmentTags, placeChecks, togglePlace } from "@/lib/fulfillment-tags";
import {
  fulfilmentBooleans,
  fulfilmentHasAxis,
  toggleFulfilmentAxis,
} from "@/app/[locale]/register/producer/registerProducerShared";

vi.mock("next-intl", () => ({ useTranslations: () => (k) => k }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ alt, src }) => <img alt={alt} src={typeof src === "string" ? src : ""} />,
}));
vi.mock("@/lib/cloudinary", () => ({ optimizeCloudinary: (u) => u || "" }));
vi.mock("@/lib/user-location", () => ({ useUserLocation: () => ({ location: null }) }));

const t = (k) => k;
const keys = (shape) => fulfillmentTags(shape, t).map((x) => x.key);

describe("fulfillmentTags — byArrangement", () => {
  it("alone → the arranged tag only", () => {
    expect(keys({ byArrangement: true })).toEqual(["arranged"]);
  });
  it("with delivery → «משלוח» (not «משלוח בלבד») beside «בתיאום מראש»", () => {
    expect(keys({ delivers: true, byArrangement: true })).toEqual(["delivery", "arranged"]);
  });
  it("control: delivery alone keeps its exclusive wording", () => {
    expect(keys({ delivers: true })).toEqual(["delivery_only"]);
  });
});

describe("MapProducerCard reads by_arrangement only with a place", () => {
  const base = { id: "p1", name: "משק", images: [], categories: [{ name: "ירקות" }] };
  it("place + by_arrangement + delivery → two tags", () => {
    render(<MapProducerCard producer={{ ...base, delivers: true, by_arrangement: true, has_physical_location: true }} />);
    expect(screen.getByTestId("map-fulfillment-delivery")).toBeInTheDocument();
    expect(screen.getByTestId("map-fulfillment-arranged")).toBeInTheDocument();
  });
  it("a stale by_arrangement without a place is ignored", () => {
    render(<MapProducerCard producer={{ ...base, delivers: true, by_arrangement: true, has_physical_location: false }} />);
    expect(screen.getByTestId("map-fulfillment-delivery_only")).toBeInTheDocument();
    expect(screen.queryByTestId("map-fulfillment-arranged")).toBeNull();
  });
});

describe("place checkboxes (dashboard + admin)", () => {
  it("the two are exclusive and unticking leaves no place", () => {
    expect(placeChecks(true, false)).toEqual({ onsite: true, arranged: false });
    expect(placeChecks(true, true)).toEqual({ onsite: false, arranged: true });
    expect(placeChecks(false, true)).toEqual({ onsite: false, arranged: false });
    expect(togglePlace("arranged", true)).toEqual({ hasPhysical: true, byArrangement: true });
    expect(togglePlace("onsite", true)).toEqual({ hasPhysical: true, byArrangement: false });
    expect(togglePlace("arranged", false)).toEqual({ hasPhysical: false, byArrangement: false });
  });
});

describe("registration wizard — three answers", () => {
  it("arranged replaces onsite and keeps delivery", () => {
    const v = toggleFulfilmentAxis("both", "arranged");
    expect(fulfilmentHasAxis(v, "arranged")).toBe(true);
    expect(fulfilmentHasAxis(v, "onsite")).toBe(false);
    expect(fulfilmentHasAxis(v, "delivery")).toBe(true);
    expect(fulfilmentBooleans(v)).toEqual({ has_physical_location: true, offers_delivery: true, by_arrangement: true });
  });
  it("a draft saved before MEH-2447 («both») still loads", () => {
    expect(fulfilmentBooleans("both")).toEqual({ has_physical_location: true, offers_delivery: true, by_arrangement: false });
    expect(toggleFulfilmentAxis("onsite", "delivery")).toBe("both");
  });
  it("unticking everything is the empty answer", () => {
    expect(toggleFulfilmentAxis("arranged", "arranged")).toBe("");
  });
});

