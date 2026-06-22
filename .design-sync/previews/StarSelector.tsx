import { StarSelector } from "mehamakor-frontend";

export function Empty() {
  return <StarSelector value={0} onChange={() => {}} />;
}

export function PartialFour() {
  return <StarSelector value={4} onChange={() => {}} />;
}

export function FullFive() {
  return <StarSelector value={5} onChange={() => {}} />;
}
