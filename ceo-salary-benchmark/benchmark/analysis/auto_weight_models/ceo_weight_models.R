suppressPackageStartupMessages({library(jsonlite); library(MASS); library(mgcv); library(lme4)})
args <- commandArgs(trailingOnly=TRUE)
repo <- args[[1]]; out <- args[[2]]; reps <- if(length(args)>=3) as.integer(args[[3]]) else 20L
set.seed(20260828)
s <- paste(readLines(file.path(repo,"app-data.js"),warn=FALSE),collapse="\n")
s <- sub("^window.CEO_BENCHMARK_DATA\\s*=\\s*","",s); s <- sub(";\\s*$","",s)
d <- fromJSON(s,simplifyVector=TRUE); z <- d$incumbents
z$salary_base <- z$salary$base; z$salary_cash <- z$salary$cash
z <- z[z$defaultIncluded & is.finite(z$salary_base) & z$salary_base>0,]
z$y <- log(z$salary_base)
for(v in c("titleGroup","eaAffinity","structure","topic")) z[[v]] <- factor(z[[v]])

folds <- function(org,k,seed){set.seed(seed);u<-sample(unique(org));split(u,rep(seq_len(k),length.out=length(u)))}
prep <- function(tr,te){
  tr$log_exp<-log(tr$expenses);te$log_exp<-log(te$expenses)
  medstaff<-median(tr$staff[tr$staff>0],na.rm=TRUE)
  tr$log_staff<-log(ifelse(is.finite(tr$staff)&tr$staff>0,tr$staff,medstaff))
  te$log_staff<-log(ifelse(is.finite(te$staff)&te$staff>0,te$staff,medstaff))
  medyear<-median(tr$compensationYear,na.rm=TRUE)
  tr$year<-ifelse(is.finite(tr$compensationYear),tr$compensationYear,medyear)-2024
  te$year<-ifelse(is.finite(te$compensationYear),te$compensationYear,medyear)-2024
  list(tr=tr,te=te)
}
models <- c("intercept","scale_lm","scale_rlm","scale_gam_REML","partial_pool_lmer","partial_pool_topic_lmer")
metrics <- list(); singular <- setNames(integer(length(models)),models); failures <- setNames(integer(length(models)),models)
for(r in seq_len(reps)){
  fs<-folds(z$organization,10,20260828+r*1009); pred<-matrix(NA_real_,nrow(z),length(models),dimnames=list(NULL,models))
  for(f in seq_along(fs)){
    ii<-which(z$organization %in% fs[[f]]);jj<-setdiff(seq_len(nrow(z)),ii);pp<-prep(z[jj,],z[ii,]);tr<-pp$tr;te<-pp$te
    pred[ii,"intercept"]<-mean(tr$y)
    fits <- list(
      scale_lm=try(lm(y~log_exp+log_staff+year,data=tr),silent=TRUE),
      scale_rlm=try(rlm(y~log_exp+log_staff+year,data=tr,maxit=100),silent=TRUE),
      scale_gam_REML=try(gam(y~s(log_exp,k=4)+s(log_staff,k=4)+year,data=tr,method="REML"),silent=TRUE),
      partial_pool_lmer=try(lmer(y~log_exp+log_staff+year+(1|titleGroup)+(1|eaAffinity)+(1|structure),data=tr,REML=TRUE,control=lmerControl(check.conv.singular="ignore")),silent=TRUE),
      partial_pool_topic_lmer=try(lmer(y~log_exp+log_staff+year+(1|titleGroup)+(1|eaAffinity)+(1|structure)+(1|topic),data=tr,REML=TRUE,control=lmerControl(check.conv.singular="ignore")),silent=TRUE)
    )
    for(nm in names(fits)){
      fit<-fits[[nm]]
      if(inherits(fit,"try-error")){failures[nm]<-failures[nm]+1;pred[ii,nm]<-mean(tr$y);next}
      if(inherits(fit,"merMod") && isSingular(fit,tol=1e-4)) singular[nm]<-singular[nm]+1
      pr<-try(if(inherits(fit,"merMod")) predict(fit,newdata=te,allow.new.levels=TRUE) else predict(fit,newdata=te),silent=TRUE)
      if(inherits(pr,"try-error")||any(!is.finite(pr))){failures[nm]<-failures[nm]+1;pr<-rep(mean(tr$y),nrow(te))}
      pred[ii,nm]<-pr
    }
  }
  for(nm in models){e<-z$y-pred[,nm];metrics[[length(metrics)+1]]<-data.frame(replicate=r,model=nm,rmse_log=sqrt(mean(e^2)),mae_log=mean(abs(e)),r2_oos=1-sum(e^2)/sum((z$y-mean(z$y))^2),mdape=median(abs(exp(pred[,nm]-z$y)-1)))}
}
res<-do.call(rbind,metrics)
summary<-aggregate(cbind(rmse_log,mae_log,r2_oos,mdape)~model,res,median)
summary$singular_folds<-singular[summary$model];summary$failed_folds<-failures[summary$model]
write.csv(summary,out,row.names=FALSE);write.csv(res,sub("\\.csv$",".repeats.csv",out),row.names=FALSE)
print(summary)
