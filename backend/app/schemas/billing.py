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

from typing import Literal

from pydantic import BaseModel


class BillingKindOut(BaseModel):
    kind: str
    bookings: int
    value_agorot: int


class BillingSummaryOut(BaseModel):
    month: str  # "YYYY-MM", an Israel calendar month
    phase: Literal["launch", "billing"]  # "launch" = nothing is charged
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
    # Plain commission the month would cost; 0 under the threshold.
    would_pay_agorot: int


class BillingHistoryMonthOut(BaseModel):
    """One past month as it would have been billed (shadow billing)."""

    month: str
    businesses: int
    businesses_over_threshold: int
    value_agorot: int
    would_pay_total_agorot: int


class BillingOverviewOut(BaseModel):
    month: str
    threshold_agorot: int
    businesses_over_threshold: int
    businesses_over_two_months: int
    # How many businesses, that many months in a row, is the signal to start billing.
    start_billing_businesses: int
    # ...and how many months in a row each of them has to reach the amount.
    start_billing_months: int
    would_pay_total_agorot: int
    phase: Literal["launch", "billing"]  # "launch" = nothing is charged
    # The month and the five before it, newest first.
    history: list[BillingHistoryMonthOut]
    rows: list[BillingOverviewRowOut]
