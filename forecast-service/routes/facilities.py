from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any
from db import get_all_facilities, get_facility, upsert_facility, bulk_upsert, delete_facility

router = APIRouter()

class FacilityIn(BaseModel):
    id:           str
    name:         str
    district:     str
    facilityType: str
    data:         dict[str, Any]

class BulkFacilityIn(BaseModel):
    id:           str
    name:         str
    district:     str
    facilityType: str
    data:         dict[str, Any]

@router.get("/facilities")
def list_facilities():
    return get_all_facilities()

@router.get("/facilities/{facility_id}")
def get_one(facility_id: str):
    f = get_facility(facility_id)
    if not f:
        raise HTTPException(status_code=404, detail="Facility not found")
    return f

@router.post("/facilities", status_code=201)
def create_facility(body: FacilityIn):
    upsert_facility(body.id, body.name, body.district, body.facilityType, body.data)
    return {"id": body.id}

@router.post("/facilities/bulk", status_code=201)
def bulk_create(facilities: list[BulkFacilityIn]):
    if not facilities:
        raise HTTPException(status_code=400, detail="Body must be a non-empty array")
    bulk_upsert([f.model_dump() for f in facilities])
    return {"inserted": len(facilities)}

@router.put("/facilities/{facility_id}")
def update_facility(facility_id: str, body: FacilityIn):
    upsert_facility(facility_id, body.name, body.district, body.facilityType, body.data)
    return {"id": facility_id}

@router.delete("/facilities/{facility_id}")
def remove_facility(facility_id: str):
    if not delete_facility(facility_id):
        raise HTTPException(status_code=404, detail="Facility not found")
    return {"deleted": facility_id}