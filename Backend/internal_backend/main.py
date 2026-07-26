import os
from fastapi import FastAPI,HTTPException
from fastapi.responses import PlainTextResponse
from starlette import status
from id_validation import id_validation
import json


#validating the identity API

id_val_object = id_validation(id='9801315140089')
print(id_val_object.senaty_excutor())

app = FastAPI()


@app.get('/id_pre-check', status_code=status.HTTP_200_OK, response_class=PlainTextResponse)
def id_pre_check(id:str):
    try:
        id_new_object = id_validation(id=id)
        response = id_new_object.senaty_excutor()
        return json.dumps(response, indent=4)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))






