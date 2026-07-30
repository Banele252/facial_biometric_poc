from sim_swap_activation import ActivationStatus, InMemorySimRegistry, activate_new_sim
from sim_swap_request import (
    FraudDecision,
    InMemoryOrderStore,
    VerificationStatus,
    create_sim_swap_request,
)


def make_created_order(store, msisdn="27821234567", new_sim_serial="SIM-NEW"):
    result = create_sim_swap_request(
        msisdn,
        new_sim_serial,
        "9001015011082",
        VerificationStatus.ACCEPTED,
        FraudDecision.APPROVE,
        store,
    )
    return result.order


def test_activating_a_created_order_succeeds():
    order_store = InMemoryOrderStore()
    registry = InMemorySimRegistry()
    order = make_created_order(order_store)

    result = activate_new_sim(order.order_id, order_store, registry)

    assert result.status == ActivationStatus.ACTIVATED
    assert result.new_sim_serial == "SIM-NEW"
    assert registry.get_active_sim("27821234567") == "SIM-NEW"


def test_activation_deactivates_the_previous_sim():
    order_store = InMemoryOrderStore()
    registry = InMemorySimRegistry()
    registry.set_active_sim("27821234567", "SIM-OLD")
    order = make_created_order(order_store, new_sim_serial="SIM-NEW")

    result = activate_new_sim(order.order_id, order_store, registry)

    assert result.previous_sim_serial == "SIM-OLD"
    assert registry.get_active_sim("27821234567") == "SIM-NEW"


def test_first_activation_for_msisdn_has_no_previous_sim():
    order_store = InMemoryOrderStore()
    registry = InMemorySimRegistry()
    order = make_created_order(order_store)

    result = activate_new_sim(order.order_id, order_store, registry)

    assert result.previous_sim_serial is None


def test_unknown_order_id_is_rejected():
    order_store = InMemoryOrderStore()
    registry = InMemorySimRegistry()

    result = activate_new_sim("does-not-exist", order_store, registry)

    assert result.status == ActivationStatus.REJECTED
    assert "No SIM Swap order found" in result.reasons[0]


def test_double_activation_is_rejected():
    order_store = InMemoryOrderStore()
    registry = InMemorySimRegistry()
    order = make_created_order(order_store)
    activate_new_sim(order.order_id, order_store, registry)

    result = activate_new_sim(order.order_id, order_store, registry)

    assert result.status == ActivationStatus.REJECTED
    assert "ACTIVATED" in result.reasons[0]


def test_order_status_updated_in_store_after_activation():
    order_store = InMemoryOrderStore()
    registry = InMemorySimRegistry()
    order = make_created_order(order_store)

    activate_new_sim(order.order_id, order_store, registry)

    assert order_store.get(order.order_id).status.value == "ACTIVATED"
