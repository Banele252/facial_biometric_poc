import os
from fastapi import FastAPI,HTTPException
from starlette import status
from id_validation import id_validation


#validating the identity API

id_val_object = id_validation(id='9801315140089')





