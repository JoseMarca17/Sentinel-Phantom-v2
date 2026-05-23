# backend/models.py
from sqlalchemy import Column, Integer, String, DateTime
from backend.database import Base
import datetime

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="operator")

class IRCapture(Base):
    __tablename__ = "ir_captures"
    id = Column(Integer, primary_key=True, index=True)
    protocol = Column(String, nullable=False)
    code = Column(String, nullable=False)
    bits = Column(Integer, nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
