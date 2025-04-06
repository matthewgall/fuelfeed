.PHONY: mirror
mirror:
	@echo Creating temporary workspace
	@mkdir -p data

	@echo Downloading data to temporary workspace
	@npm run mirror

	@echo Uploading to R2
	@rclone sync data/ r2:fuelfeed

	@echo Cleaning up temporary workspace
	@rm -rf data