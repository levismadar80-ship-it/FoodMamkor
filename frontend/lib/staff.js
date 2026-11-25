// @ts-check
/**
 * Module:   staff
 * Purpose:  The order-staff calls (MEH-3526): the owner lists, invites and
 *           removes; the invited person accepts.
 * Touches:  GET/POST /producers/me/staff · DELETE /producers/me/staff/{id} ·
 *           POST /staff-invites/accept (backend/app/routers/producer_staff.py).
 * Does NOT: decide who may do what — the server checks every call
 *           (services/order_access.py). Does not hold the token: the invite
 *           page reads it from lib/claim-token.js.
 */

import api from "@/lib/api";
import { StaffListOutSchema, StaffMemberOutSchema } from "@/lib/api-responses";

/** @returns {Promise<{ staff: any[], max_staff: number }>} */
export async function listStaff() {
  const res = await api.get("/producers/me/staff");
  return StaffListOutSchema.parse(res.data);
}

/** @param {string} email */
export async function inviteStaff(email) {
  const res = await api.post("/producers/me/staff", { email });
  return StaffMemberOutSchema.parse(res.data);
}

/** @param {string} id */
export async function removeStaff(id) {
  await api.delete(`/producers/me/staff/${id}`);
}

/** @param {string} token */
export async function acceptStaffInvite(token) {
  await api.post("/staff-invites/accept", { token });
}
