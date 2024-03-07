ROOT_DIR=$(shell dirname $(realpath $(firstword $(MAKEFILE_LIST))))
BACKEND_SETTINGS=$(shell readlink --canonicalize ${ROOT_DIR}/env/_backend_le.tfvars)
LOCAL_SETTINGS=$(shell readlink --canonicalize ${ROOT_DIR}/env/_environment_le.tfvars)

default: clean plan

.terraform:
	@terraform init -backend-config=${BACKEND_SETTINGS}

plan: .terraform format
	@terraform workspace select $(env) || terraform workspace new $(env) 
	@terraform plan -var-file=${LOCAL_SETTINGS} -var='environment=$(env)' -out $(env).tfplan

refresh:
	@terraform refresh -var-file=${LOCAL_SETTINGS}

apply: .terraform
	@terraform workspace select $(env) || terraform workspace new $(env)
	@terraform apply -auto-approve $(env).tfplan
	@rm -f ./$(env).tfplan

destroy: .terraform
	@terraform workspace select $(env)
	@terraform destroy -auto-approve -var-file=${LOCAL_SETTINGS} -var='environment=$(env)'

format:
	@terraform fmt -recursive

upgrade: clean
	@terraform init -upgrade -backend-config=${BACKEND_SETTINGS}
	@terraform providers lock

clean:
	@rm -rf ./.terraform/ ./*.tfplan

.PHONY: init plan refresh apply format upgrade clean
