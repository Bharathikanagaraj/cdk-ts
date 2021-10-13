import cdk=  require('@aws-cdk/core');
import * as ec2 from '@aws-cdk/aws-ec2';
import * as rds from '@aws-cdk/aws-rds';
import * as iam from '@aws-cdk/aws-iam';
import * as s3 from '@aws-cdk/aws-s3';
import { Port, SecurityGroup } from '@aws-cdk/aws-ec2';
import { ManagedPolicy, Policy, Role } from '@aws-cdk/aws-iam';
import { Tag } from "@aws-cdk/core";

export class EC2RDSStack extends cdk.Stack {
  constructor(scope: any, id: any, props?: any) {
    super(scope, id, props);

    // Bucket Creation.
    const bucket=new s3.Bucket(this, 'Bharathi-bucket',{
      bucketName: 'bharathi0001',
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects:true
    });

    const buildRole = new iam.Role(this, "CodeBuildRole", {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });
    new iam.Policy(this, "CodeBuildRolePolicy", {
      statements: [
          new iam.PolicyStatement({
              actions: [
                  "codecommit:GitPull",
                  "logs:CreateLogGroup",
                  "logs:CreateLogStream",
                  "logs:PutLogEvents",
                  "s3:GetObject",
                  "s3:GetObjectVersion",
                  "s3:PutObject",
                  "ssm:GetParameters"
              ],
              resources: ["*"]
          }),
      ],
      roles: [
          buildRole
      ]
    });
    const deployRole = new iam.Role(this, "CodeDeployRole", {
      assumedBy: new iam.ServicePrincipal('codedeploy.amazonaws.com'),
      managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSCodeDeployRole"),
      ]
    });

    const role = new iam.Role(this, "WebAppInstanceRole", {
    assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("AWSCodeDeployReadOnlyAccess"),
        iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonEC2ReadOnlyAccess")
      ]
    });
    new iam.Policy(this, "DeploymentInstancePolicy", {
    statements: [
        new iam.PolicyStatement({
            actions: [
                "s3:GetObject",
            ],
            resources: ["*"]
        }),
      ],
      roles: [
        role
      ]
    });

    const vpc=new ec2.Vpc(this,'VPC-tsc',{
      cidr:'30.0.0.0/16',
      maxAzs:2,
      subnetConfiguration:[
        {
          subnetType:ec2.SubnetType.PUBLIC,
          name:'VPC-tsc-Public',
          cidrMask:24,
        },
        {
          subnetType:ec2.SubnetType.PRIVATE_ISOLATED,
          name:'VPC-tsc-Private',
          cidrMask:24,
        }
      ], 
      })

    const igwID = vpc.internetGatewayId;
    // Creating Security Group.
    const ec2securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup',{
      vpc: vpc,
      securityGroupName: "ec2-sg",
      description : "Allow SSH for ec2",
      allowAllOutbound : true
    });
    ec2securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'allow ssh')
    ec2securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'allow web pages')

    const userData = ec2.UserData.forLinux({ shebang: "#!/bin/bash -ex" });
    userData.addCommands(
      "yum install -y aws-cli", 
      "yum install -y git", 
      "cd /home/ec2-user/", 
      "wget https://aws-codedeploy-" + cdk.Aws.REGION + ".s3.amazonaws.com/latest/codedeploy-agent.noarch.rpm", 
      "yum -y install codedeploy-agent.noarch.rpm", 
      "service codedeploy-agent start"
      );

    const devInstance = new ec2.Instance(this, 'Dev-Instance', {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: new ec2.AmazonLinuxImage,
      vpc: vpc ,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      },
      securityGroup: ec2securityGroup,
      userData: userData,
      instanceName: "Dev-Instance",
      role: role,
      keyName: 'temp',
      
    });
    cdk.Tag.add(devInstance, "Name", "Dev-Instance");
    cdk.Tag.add(devInstance, "App", "DemoApp");
    cdk.Tag.add(devInstance, "Env", "DEV");

    const prodInstance = new ec2.Instance(this, 'Prod-Instance', {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: new ec2.AmazonLinuxImage,
      vpc: vpc ,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PUBLIC
      },
      securityGroup: ec2securityGroup,
      userData: userData,
      instanceName: "Prod-Instance",
      role: role,
      keyName: 'temp',
    });
    cdk.Tag.add(prodInstance, "Name", "Prod-Instance");
    cdk.Tag.add(prodInstance, "App", "DemoApp");
    cdk.Tag.add(prodInstance, "Env", "PRD");

    const ec2InstancePrivate  = new ec2.Instance(this, 'Private-Instance',{
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: new ec2.AmazonLinuxImage,
      vpc: vpc,
      vpcSubnets:{
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED
      },
      securityGroup: ec2securityGroup,
      userData: userData,
      instanceName: 'Private-Instance',
      role: role,
      keyName: 'temp'
    });
    //RDS Security Group
    const rdsSG = new ec2.SecurityGroup(this, 'rds-sg',{
      vpc: vpc,
      securityGroupName: "RDS-SG",
      description: "Access RDS DB",
      allowAllOutbound: true
    });
    rdsSG.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(3306), 'Allow RDS_DB')

    const rdsInstance = new rds.DatabaseInstance(this, 'Bharathi-rds', {
      engine: rds.DatabaseInstanceEngine.mysql({ version:rds.MysqlEngineVersion.VER_8_0_25 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE3, ec2.InstanceSize.SMALL),
      credentials: rds.Credentials.fromGeneratedSecret('syscdk'), // Optional - will default to 'admin' username and generated password
      databaseName:'bharathiRDS',
      vpc: vpc,
      vpcSubnets: {
      subnetType: ec2.SubnetType.PRIVATE_ISOLATED
      },
      instanceIdentifier:'bharathiRD',  
      securityGroups: [rdsSG],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    
    new cdk.CfnOutput(this, "DevLocation", {
      description: "Development web server location",
      value: "http://" + devInstance.instancePublicDnsName
    })
    new cdk.CfnOutput(this, "PrdLocation", {
      description: "Production web server location",
      value: "http://" + prodInstance.instancePublicDnsName
    })

    new cdk.CfnOutput(this, "BucketName", {
      description: "Bucket for storing artifacts",
      value: bucket.bucketName
    })

    new cdk.CfnOutput(this, "BuildRoleArn", {
      description: "Build role ARN",
      value: buildRole.roleArn
    })

    new cdk.CfnOutput(this, "DeployRoleArn", {
      description: "Deploy role ARN",
      value: deployRole.roleArn
    })
  }
}
