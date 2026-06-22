import { StarRating } from "mehamakor-frontend";

export function HighRating() {
  return <StarRating avg={4.8} count={128} />;
}

export function MidRating() {
  return <StarRating avg={3.5} count={24} />;
}

export function SingleRating() {
  return <StarRating avg={5.0} count={1} />;
}
