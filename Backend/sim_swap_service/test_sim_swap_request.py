from sim_swap_request import (
    FraudDecision,
    InMemoryOrderStore,
    OrderStatus,
    VerificationStatus,
    create_sim_swap_request,
)


def test_verification_accepted_and_fraud_approved_creates_order():
    store = InMemoryOrderStore()
    result = create_sim_swap_request(
        "27821234567", "SIM-SERIAL-1", "9001015011082",
        VerificationStatus.ACCEPTED, FraudDecision.APPROVE, store,
    )
    assert result.status == OrderStatus.CREATED
    assert result.order is not None
    assert result.order.msisdn == "27821234567"
    assert store.get(result.order.order_id) == result.order


def test_verification_rejected_blocks_order_creation():
    store = InMemoryOrderStore()
    result = create_sim_swap_request(
        "27821234567", "SIM-SERIAL-1", "9001015011082",
        VerificationStatus.REJECTED, FraudDecision.APPROVE, store,
    )
    assert result.status == OrderStatus.REJECTED
    assert result.order is None
    assert any("verification" in r.lower() for r in result.reasons)


def test_fraud_refer_blocks_order_creation():
    store = InMemoryOrderStore()
    result = create_sim_swap_request(
        "27821234567", "SIM-SERIAL-1", "9001015011082",
        VerificationStatus.ACCEPTED, FraudDecision.REFER, store,
    )
    assert result.status == OrderStatus.REJECTED
    assert result.order is None
    assert any("REFER" in r for r in result.reasons)


def test_fraud_reject_blocks_order_creation():
    store = InMemoryOrderStore()
    result = create_sim_swap_request(
        "27821234567", "SIM-SERIAL-1", "9001015011082",
        VerificationStatus.ACCEPTED, FraudDecision.REJECT, store,
    )
    assert result.status == OrderStatus.REJECTED
    assert result.order is None


def test_both_gates_failing_reports_both_reasons():
    store = InMemoryOrderStore()
    result = create_sim_swap_request(
        "27821234567", "SIM-SERIAL-1", "9001015011082",
        VerificationStatus.REJECTED, FraudDecision.REJECT, store,
    )
    assert len(result.reasons) == 2


def test_rejected_request_does_not_touch_the_store():
    store = InMemoryOrderStore()
    create_sim_swap_request(
        "27821234567", "SIM-SERIAL-1", "9001015011082",
        VerificationStatus.REJECTED, FraudDecision.REJECT, store,
    )
    assert store._orders == {}
