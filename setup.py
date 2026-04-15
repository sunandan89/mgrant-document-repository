from setuptools import setup, find_packages

with open("README.md", "r") as f:
    long_description = f.read()

setup(
    name="mgrant_document_repository",
    version="1.0.0",
    description="Central Document Repository for mGrant",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="Dhwani RIS",
    author_email="sunandan@dhwaniris.com",
    packages=find_packages(),
    zip_safe=False,
    include_package_data=True,
    install_requires=[],
)
