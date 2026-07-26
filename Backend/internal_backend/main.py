import os
from fastapi import FastAPI,HTTPException
from fastapi.responses import PlainTextResponse
from starlette import status
from id_validation import id_validation
import json
from audit_database import AuditDB


#validating the identity API

# I used the below part to test and it works
#id_val_object = id_validation(id='')
#print(id_val_object.senaty_excutor())
#test = id_val_object.senaty_excutor()
#log_audit_record = AuditDB(input_data=test)
#log_audit_record.insert_record()
#log_audit_record.close()


app = FastAPI()


@app.get('/id_pre-check', status_code=status.HTTP_200_OK, response_class=PlainTextResponse)
def id_pre_check(id:str):
    try:
        id_new_object = id_validation(id=id)
        response = id_new_object.senaty_excutor()

        #connect to the postgres database to pass the information
        #API within an API
        log_audit_records = AuditDB(input_data=response)
        log_audit_records.insert_record()
        log_audit_records.close()

        return json.dumps(response, indent=4)
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    






