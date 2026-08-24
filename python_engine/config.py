from __future__ import annotations
import os
from dataclasses import dataclass
@dataclass(frozen=True)
class PythonEngineConfig:
    embedding_provider: str
    embedding_model: str
    embedding_dimensions: int
    supabase_url: str | None
    supabase_service_role_key: str | None
    @classmethod
    def from_env(cls)->'PythonEngineConfig': return cls(os.getenv('FLUXENTIQ_EMBEDDING_PROVIDER','disabled'),os.getenv('FLUXENTIQ_EMBEDDING_MODEL',''),int(os.getenv('FLUXENTIQ_EMBEDDING_DIMENSIONS','1536')),os.getenv('SUPABASE_URL'),(os.getenv('SUPABASE_SECRET_KEY','').strip() or os.getenv('SUPABASE_SERVICE_ROLE_KEY')))
