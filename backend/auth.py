from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from backend.database import get_db
from backend.models import User
import hashlib
import secrets
import jwt
import os

router = APIRouter(prefix="/api/auth", tags=["auth"])

SECRET_KEY = os.getenv("PHANTOM_SECRET", "sentinel_phantom_emi_2025_secret_key")
ALGORITHM  = "HS256"
TOKEN_TTL  = 480  # minutos — 8 horas

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def create_token(username: str, role: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=TOKEN_TTL)
    return jwt.encode(
        {"sub": username, "role": role, "exp": expire},
        SECRET_KEY, algorithm=ALGORITHM
    )


def verify_token(token: str = Depends(oauth2_scheme)) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expirado")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Token inválido")


@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form.username).first()
    if not user or user.password_hash != hash_password(form.password):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    token = create_token(user.username, user.role)
    return {"access_token": token, "token_type": "bearer", "role": user.role}


@router.post("/logout")
def logout():
    # El logout es client-side (borra el token)
    return {"status": "OK"}


@router.get("/me")
def me(payload: dict = Depends(verify_token)):
    return {"username": payload["sub"], "role": payload["role"]}


# Seed: crea el usuario admin por defecto si no existe
def seed_admin(db: Session):
    exists = db.query(User).filter(User.username == "admin").first()
    if not exists:
        db.add(User(
            username="admin",
            password_hash=hash_password("phantom2025"),
            role="admin"
        ))
        db.commit()
        print("[AUTH] Usuario admin creado — cambia la contraseña en producción")