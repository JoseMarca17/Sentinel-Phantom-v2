# backend/models.py
from sqlalchemy import Column, Integer, String, DateTime, Float, Boolean
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

class RFIDCapture(Base):
    __tablename__ = "rfid_captures"
    id = Column(Integer, primary_key=True, index=True)
    uid = Column(String, nullable=False)
    card_type = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.now)

class SubGHzCapture(Base):
    __tablename__ = "subghz_captures"
    
    id = Column(Integer, primary_key=True, index=True)
    alias = Column(String, nullable=False)
    freq_mhz = Column(Float, nullable=False)
    pulse_string = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)


class WiFiCapture(Base):
    __tablename__ = "wifi_captures"
    id = Column(Integer, primary_key=True, index=True)
    ssid = Column(String, nullable=True)
    bssid = Column(String, nullable=False, index=True)
    channel = Column(Integer, nullable=False)
    encryption = Column(String, default="WPA2")
    capture_type = Column(String, nullable=False)   
    payload_path = Column(String, nullable=True)     
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)


class WiFiAccessPoint(Base):
    __tablename__ = "wifi_access_points"
    
    id = Column(Integer, primary_key=True, index=True)
    ssid = Column(String, default="SSID Oculto")
    bssid = Column(String, nullable=False, unique=True, index=True) 
    channel = Column(Integer, nullable=False)
    rssi = Column(Integer, nullable=False)
    wps_active = Column(Boolean, default=False)
    is_rogue = Column(Boolean, default=False)       
    last_seen = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class WiFiClient(Base):
    __tablename__ = "wifi_clients"
    
    id = Column(Integer, primary_key=True, index=True)
    mac = Column(String, nullable=False, index=True)
    associated_bssid = Column(String, nullable=True) 
    searching_for = Column(String, nullable=True)    
    rssi = Column(Integer, nullable=False)
    client_type = Column(String, default="STATION")   
    ip_address = Column(String, nullable=True)       
    last_seen = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)