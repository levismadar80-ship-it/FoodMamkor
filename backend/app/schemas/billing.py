"""
Module:   billing (schemas)
Purpose:  Response shapes for the billing summary routes (MEH-3181).
Touches:  nothing.
Does NOT: carry personal data — counts and amounts only.
Related:  app/routers/billing.py · app/services/billing_summary.py
History:  MEH-3181 (creation, 2026-11-14).
"""

from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel


class BillingKindOut(BaseModel):
    kind: str
    bookings: int
    value_agorot: int


class BillingSummaryOut(BaseModel):
    month: str  # "YYYY-MM", an Israel calendar month
    phase: str  # "launch" = nothing is charged
    bookings: int
    value_agorot: int
    by_kind: list[BillingKindOut]
    # Paid bookings (agorot) a month must reach before it is billed.
    threshold_agorot: int
    over_threshold: bool
    # What each route WOULD cost under the price list. Nothing is charged.
    fee_without_subscription_agorot: int
    fee_with_subscription_agorot: int
    charged_agorot: int
    price_list_version: int


class BillingOverviewRowOut(BaseModel):
    producer_id: UUID
    name: str
    bookings: int
    value_agorot: int
    over_threshold: bool
    months_over_in_a_row: int


class BillingOverviewOut(BaseModel):
    month: str
    threshold_agorot: int
    businesses_over_threshold: int
    businesses_over_two_months: int
    rows: list[BillingOverviewRowOut]
