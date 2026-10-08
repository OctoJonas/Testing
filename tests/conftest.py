"""Shared pytest fixtures for the testing suite."""

import sys
from pathlib import Path

import pytest
import yaml

# Add backend to path for imports
BACKEND_PATH = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(BACKEND_PATH))


@pytest.fixture
def test_config():
    """Load test_config.yaml configuration."""
    config_path = Path(__file__).parent / "test_config.yaml"
    with open(config_path) as f:
        return yaml.safe_load(f)


@pytest.fixture
def octonomy_test_agent(test_config):
    """Get the octonomy_client_test agent configuration."""
    return test_config["octonomy_client_test"]


@pytest.fixture
def default_settings(test_config):
    """Get default settings from test_config.yaml."""
    return test_config.get("defaults", {})
